import { describe, expect, it } from 'vitest';
import { composeWgsl } from '../../../../scene/shaders/composeWgsl';
import { instantiateModule } from '../../../../scene/shaders/instantiate';
import { wgslModule } from '../../../../scene/shaders/WgslModule';
import { DirectionalLight } from '../../DirectionalLight';
import { Light } from '../../Light';
import { PointLight } from '../../PointLight';
import { ShadowMap } from '../../ShadowMap';
import {
    lightTransmissionPoint,
    lightTransmissionReady,
    lightVisibilityPoint,
    sceneAnyLightDirectionPoint,
    lightVisibilityReady,
    sceneLightDirectionPoint,
    sceneLightDirectionReady,
} from '../lighting';

describe('pontos de cena do sombreamento (spec 031, T041)', () => {
    it('prontos: direção padrão, visibilidade 1, transmissão ambiente + direta — e montam sozinhos', () => {
        expect(sceneLightDirectionReady.source).toContain('return DEFAULT_LIGHT_DIRECTION;');
        expect(lightVisibilityReady.source).toContain('return 1.0;');
        expect(lightTransmissionReady.source).toContain('return vec3f(ambient + direct);');
        for (const m of [sceneLightDirectionReady, lightVisibilityReady, lightTransmissionReady]) {
            expect(() => composeWgsl(m)).not.toThrow();
        }
    });

    it('vários contribuintes: direção do primeiro; visibilidade é o produto em ordem; transmissão com o ambiente só no primeiro', () => {
        const fn = (name: string, body: string, sig: string) =>
            wgslModule({ name, source: `fn ${sig} { ${body} }` });
        const vis = [0, 1].map((k) =>
            instantiateModule(
                fn(
                    `vis${k}`,
                    `return ${k + 2}.0;`,
                    'light_visibility(p: vec3f, n_dot_l: f32) -> f32',
                ),
                `_${k}`,
            ),
        );
        expect(lightVisibilityPoint.combine(vis).source).toContain(
            'return light_visibility_0(p, n_dot_l) * light_visibility_1(p, n_dot_l);',
        );
        const dirs = [0, 1].map((k) =>
            instantiateModule(
                fn(`dir${k}`, 'return vec3f(0.0);', 'scene_light_direction() -> vec3f'),
                `_${k}`,
            ),
        );
        expect(sceneLightDirectionPoint.combine(dirs).source).toContain(
            'return scene_light_direction_0();',
        );
        const trans = [0, 1].map((k) =>
            instantiateModule(
                fn(
                    `tr${k}`,
                    'return vec3f(ambient + direct);',
                    'light_transmission(p: vec3f, ambient: f32, direct: f32) -> vec3f',
                ),
                `_${k}`,
            ),
        );
        expect(lightTransmissionPoint.combine(trans).source).toContain(
            'return light_transmission_0(p, ambient, direct) * light_transmission_1(p, 0.0, 1.0);',
        );
    });

    it('toda luz contribui com a primeira luz viva; a que projeta sombra, também com a direção e a sombra pelos slots dela', () => {
        const casting = new DirectionalLight({ castShadow: true });
        const [any, direction, visibility] = casting.getSceneContributions();
        expect(any!.point).toBe(sceneAnyLightDirectionPoint);
        expect(direction!.point).toBe(sceneLightDirectionPoint);
        expect(visibility!.point).toBe(lightVisibilityPoint);
        expect(direction!.pools).toEqual([Light.schema, ShadowMap.schema]);
        const slots = (light?: number, shadow?: number) => (pool: { name: string }) =>
            pool.name === 'Light' ? light : shadow;
        expect(direction!.build(slots(3, 1))!.source).toContain('return lights[3u].direction.xyz;');
        expect(visibility!.build(slots(3, 1))!.source).toContain('let sm = shadow_maps[1u];');
        expect(() => composeWgsl(visibility!.build(slots(3, 1))!)).not.toThrow();
        // Slot ainda ausente: não contribui.
        expect(direction!.build(slots(undefined, 1))).toBeUndefined();
        // Deixou de projetar: não contribui.
        casting.data.castShadow = 0;
        expect(visibility!.build(slots(3, 1))).toBeUndefined();
        // Sem projetar: só a primeira luz viva (a luz dos sprites), com ou sem sombra, também na pontual.
        expect(new DirectionalLight({ castShadow: false }).getSceneContributions()).toEqual([any]);
        expect(new PointLight().getSceneContributions()).toEqual([any]);
        const pool = any!.build(() => undefined)!;
        expect(pool.source).toContain('if (pool_live(light_live[i >> 5u], i))');
        expect(() => composeWgsl(pool)).not.toThrow();
    });
});
