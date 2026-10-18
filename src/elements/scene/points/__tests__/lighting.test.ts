import { describe, expect, it } from 'vitest';
import { composeWgsl } from '../../../../scene/shaders/composeWgsl';
import { instantiateModule } from '../../../../scene/shaders/instantiate';
import { wgslModule } from '../../../../scene/shaders/WgslModule';
import { DirectionalLight } from '../../DirectionalLight';
import { HemisphereLight } from '../../HemisphereLight';
import { Light } from '../../Light';
import { PointLight } from '../../PointLight';
import { ShadowMap } from '../../ShadowMap';
import { SpotLight } from '../../SpotLight';
import {
    lightTransmissionPoint,
    lightTransmissionReady,
    lightVisibilityPoint,
    lightVisibilityReady,
    sceneLightingPoint,
    sceneLightingReady,
} from '../lighting';
import {
    hemisphereAmbientContribution,
    hemisphereContribution,
    LIGHT_LIMIT,
    poolLightContribution,
} from '../lightContributions';

describe('pontos de cena do sombreamento (spec 011, T039)', () => {
    it('prontos: nenhuma luz (0), visibilidade 1, transmissão 1 — e montam sozinhos', () => {
        expect(sceneLightingReady.source).toContain('return vec3f(0.0);');
        expect(lightVisibilityReady.source).toContain(
            'fn light_visibility(light: u32, p: vec3f, n: vec3f) -> f32',
        );
        expect(lightTransmissionReady.source).toContain(
            'fn light_transmission(light: u32, p: vec3f) -> vec3f',
        );
        for (const m of [sceneLightingReady, lightVisibilityReady, lightTransmissionReady]) {
            expect(() => composeWgsl(m)).not.toThrow();
        }
    });

    it('vários contribuintes: iluminação é a soma; visibilidade e transmissão, produtos por luz, em ordem', () => {
        const fn = (name: string, body: string, sig: string) =>
            wgslModule({ name, source: `fn ${sig} { ${body} }` });
        const lit = [0, 1].map((k) =>
            instantiateModule(
                fn(
                    `lit${k}`,
                    'return vec3f(0.0);',
                    'scene_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f',
                ),
                `_${k}`,
            ),
        );
        expect(sceneLightingPoint.combine(lit).source).toContain(
            'return scene_lighting_0(c, p, n, v) + scene_lighting_1(c, p, n, v);',
        );
        const vis = [0, 1].map((k) =>
            instantiateModule(
                fn(
                    `vis${k}`,
                    'return 1.0;',
                    'light_visibility(light: u32, p: vec3f, n: vec3f) -> f32',
                ),
                `_${k}`,
            ),
        );
        expect(lightVisibilityPoint.combine(vis).source).toContain(
            'return light_visibility_0(light, p, n) * light_visibility_1(light, p, n);',
        );
        const trans = [0, 1].map((k) =>
            instantiateModule(
                fn(
                    `tr${k}`,
                    'return vec3f(1.0);',
                    'light_transmission(light: u32, p: vec3f) -> vec3f',
                ),
                `_${k}`,
            ),
        );
        expect(lightTransmissionPoint.combine(trans).source).toContain(
            'return light_transmission_0(light, p) * light_transmission_1(light, p);',
        );
    });

    it('toda luz do pool contribui o mesmo laço; a que projeta sombra, também a sombra só para ela', () => {
        const casting = new DirectionalLight({ castShadow: true });
        const [pool, visibility] = casting.getSceneContributions();
        expect(pool).toBe(poolLightContribution);
        expect(pool!.point).toBe(sceneLightingPoint);
        expect(visibility!.point).toBe(lightVisibilityPoint);
        expect(visibility!.pools).toEqual([Light.schema, ShadowMap.schema]);
        const slots = (light?: number, shadow?: number) => (p: { name: string }) =>
            p.name === 'Light' ? light : shadow;
        const shadow = visibility!.build(slots(3, 1))!;
        expect(shadow.source).toContain('if (light != 3u) { return 1.0; }');
        expect(shadow.source).toContain('let sm = shadow_maps[1u];');
        expect(() => composeWgsl(shadow)).not.toThrow();
        // Slot ainda ausente ou deixou de projetar: não contribui.
        expect(visibility!.build(slots(undefined, 1))).toBeUndefined();
        casting.data.castShadow = 0;
        expect(visibility!.build(slots(3, 1))).toBeUndefined();
        // Sem projetar, a pontual e a spot: só o laço do pool (o mesmo módulo para todas).
        for (const light of [new DirectionalLight(), new PointLight(), new SpotLight()])
            expect(light.getSceneContributions()).toEqual([poolLightContribution]);
        const loop = pool!.build(() => 0)!;
        expect(loop).toBe(pool!.build(() => 5));
        expect(loop.source).toContain('if (!pool_live(light_live[i >> 5u], i)) { continue; }');
        expect(loop.source).toContain('min(arrayLength(&lights), LIGHT_LIMIT)');
        expect(loop.source).toContain('light_visibility(i, p, n) * light_transmission(i, p)');
        expect(() => composeWgsl(loop)).not.toThrow();
    });

    it('o hemisfério contribui depois das luzes, pela transmissão da luz ambiente (NONE)', () => {
        const contributions = new HemisphereLight().getSceneContributions();
        // No desenho e, para os meios participantes (spec 033, R12), como radiância média.
        expect(contributions).toEqual([hemisphereContribution, hemisphereAmbientContribution]);
        expect(hemisphereAmbientContribution.build(() => undefined)!.source).toContain(
            'fn scene_ambient(p: vec3f) -> vec3f',
        );
        expect(hemisphereContribution.order).toBeGreaterThan(poolLightContribution.order);
        const m = hemisphereContribution.build(() => undefined)!;
        expect(m.source).toContain('closure_ambient(');
        expect(m.source).toContain('light_transmission(NONE, p)');
        expect(() => composeWgsl(m)).not.toThrow();
    });

    it('teto de luzes: o slot acima do limite avisa uma vez e continua no mesmo laço', () => {
        const warn = console.warn;
        const calls: unknown[][] = [];
        console.warn = (...args: unknown[]) => calls.push(args);
        try {
            poolLightContribution.build(() => LIGHT_LIMIT.value + 3);
            poolLightContribution.build(() => LIGHT_LIMIT.value + 4);
        } finally {
            console.warn = warn;
        }
        expect(calls).toHaveLength(1);
        expect(String(calls[0]![0])).toContain('lightLimit');
    });
});
