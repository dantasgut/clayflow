import { describe, expect, it } from 'vitest';
import { composeWgsl } from '../../../../scene/shaders/composeWgsl';
import { instantiateModule } from '../../../../scene/shaders/instantiate';
import { wgslModule } from '../../../../scene/shaders/WgslModule';
import { DirectionalLight } from '../../DirectionalLight';
import { HemisphereLight } from '../../HemisphereLight';
import { Light } from '../../Light';
import { PointLight } from '../../PointLight';
import { RectLight } from '../../RectLight';
import { ShadowAtlas } from '../../ShadowAtlas';
import { ShadowMap } from '../../ShadowMap';
import { SpotLight } from '../../SpotLight';
import {
    lightThicknessPoint,
    lightTransmissionPoint,
    lightTransmissionReady,
    lightVisibilityPoint,
    lightVisibilityReady,
    sceneAmbientLightingPoint,
    sceneAmbientLightingReady,
    sceneDirectLightingPoint,
    sceneIndirectLightingPoint,
    sceneDirectLightingReady,
    sceneIndirectLightingReady,
    sceneLightingReady,
    sceneTransmittedLightingPoint,
} from '../lighting';
import {
    hemisphereAmbientContribution,
    hemisphereEnvironmentContribution,
    hemisphereBackground,
    hemisphereBackgroundContribution,
    hemisphereContribution,
    hemisphereRayLightingContribution,
    LIGHT_LIMIT,
    lightIncoming,
    poolLightContribution,
    rectLightContribution,
    poolTransmittedContribution,
} from '../lightContributions';

describe('pontos de cena do sombreamento (spec 011, T039)', () => {
    it('prontos: nenhuma luz (0), visibilidade 1, transmissão 1 — e montam sozinhos', () => {
        expect(sceneDirectLightingReady.source).toContain('return vec3f(0.0);');
        expect(sceneIndirectLightingReady.source).toContain('return vec3f(0.0);');
        // Toda a luz: a direta mais a rebatida.
        expect(sceneLightingReady.source).toContain(
            'return scene_direct_lighting(c, p, n, v) + scene_indirect_lighting(c, p, n, v);',
        );
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
                    'scene_direct_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f',
                ),
                `_${k}`,
            ),
        );
        expect(sceneDirectLightingPoint.combine(lit).source).toContain(
            'return scene_direct_lighting_0(c, p, n, v) + scene_direct_lighting_1(c, p, n, v);',
        );
        expect(sceneIndirectLightingPoint.combine(lit).source).toContain(
            'return scene_indirect_lighting_0(c, p, n, v) + scene_indirect_lighting_1(c, p, n, v);',
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
        // Com a vista dela no atlas único (spec 013): sem vista, a luz não tem contribuição de sombra.
        new ShadowAtlas().assign(casting.shadowMap!);
        const [pool, visibility, thickness, transmitted] = casting.getSceneContributions();
        expect(pool).toBe(poolLightContribution);
        expect(pool!.point).toBe(sceneDirectLightingPoint);
        expect(visibility!.point).toBe(lightVisibilityPoint);
        expect(visibility!.pools).toEqual([Light.schema, ShadowMap.schema]);
        const slots = (light?: number, shadow?: number) => (p: { name: string }) =>
            p.name === 'Light' ? light : shadow;
        const shadow = visibility!.build(slots(3, 1))!;
        expect(shadow.source).toContain('if (light != 3u) { return 1.0; }');
        expect(shadow.source).toContain('let sm = shadow_maps[1u];');
        expect(() => composeWgsl(shadow)).not.toThrow();
        // A espessura atravessada pela luz, do mesmo mapa, só para ela; e a luz que atravessa a subsuperfície (T113).
        expect(thickness!.point).toBe(lightThicknessPoint);
        const through = thickness!.build(slots(3, 1))!;
        expect(through.source).toContain('if (light != 3u) { return vec2f(-1.0, 0.0); }');
        expect(through.source).toContain('shadow_virtual_thickness(shadow_matrices[1u], p, n, l)');
        expect(() => composeWgsl(through)).not.toThrow();
        expect(thickness!.build(slots(undefined, 1))).toBeUndefined();
        expect(transmitted).toBe(poolTransmittedContribution);
        expect(transmitted!.point).toBe(sceneTransmittedLightingPoint);
        expect(transmitted!.build(() => 0)!.source).toContain(
            'subsurface_transmission(through.x, d)',
        );
        // Slot ainda ausente ou deixou de projetar: não contribui.
        expect(visibility!.build(slots(undefined, 1))).toBeUndefined();
        casting.data.castShadow = 0;
        expect(visibility!.build(slots(3, 1))).toBeUndefined();
        expect(thickness!.build(slots(3, 1))).toBeUndefined();
        // Sem projetar, a pontual e a spot: só o laço do pool (o mesmo módulo para todas).
        for (const light of [new DirectionalLight(), new PointLight(), new SpotLight()])
            expect(light.getSceneContributions()).toEqual([poolLightContribution]);
        const loop = pool!.build(() => 0)!;
        expect(loop).toBe(pool!.build(() => 5));
        expect(loop.source).toContain(
            'if (!pool_live(light_live[i >> 5u], i) || lights[i].kind == 3u) { continue; }',
        );
        expect(loop.source).toContain('min(arrayLength(&lights), LIGHT_LIMIT)');
        expect(loop.source).toContain('light_visibility(i, p, n) * light_transmission(i, p)');
        expect(() => composeWgsl(loop)).not.toThrow();
    });

    /** As contribuições de sombra de `count` direcionais com vista no atlas: a luz `k` no slot `3 + k`, o mapa no `k`. */
    function shadowModules(count: number, point: typeof lightVisibilityPoint) {
        const atlas = new ShadowAtlas();
        return Array.from({ length: count }, (_, k) => {
            const light = new DirectionalLight({ castShadow: true });
            atlas.assign(light.shadowMap!);
            const contribution = light.getSceneContributions().find((c) => c.point === point)!;
            return contribution.build((p) => (p.name === 'Light' ? 3 + k : k))!;
        });
    }

    it.each([2, 3])(
        '%i luzes com sombra: cada contribuição de visibilidade responde só pela sua luz (spec 013, T016)',
        (count) => {
            // Arrange + Act
            const modules = shadowModules(count, lightVisibilityPoint);
            // Assert: um módulo por luz, cada um neutro (1) para as outras e lendo o referencial do seu mapa.
            expect(new Set(modules).size).toBe(count);
            modules.forEach((m, k) => {
                expect(m.source).toContain(`if (light != ${3 + k}u) { return 1.0; }`);
                expect(m.source).toContain(`let matrix = shadow_matrices[${k}u];`);
                expect(m.source).not.toContain(`shadow_matrices[${(k + 1) % count}u]`);
            });
            // A composição: o produto, em que só o fator da luz pedida difere de 1.
            const combined = lightVisibilityPoint.combine(
                modules.map((m, k) => instantiateModule(m, `_${k}`)),
            );
            expect(combined.source).toContain(
                `return ${modules.map((_, k) => `light_visibility_${k}(light, p, n)`).join(' * ')};`,
            );
            expect(() => composeWgsl(combined)).not.toThrow();
        },
    );

    it('a luz com sombra sem vista no atlas (acima do teto) não tem contribuição de sombra (spec 013)', () => {
        const atlas = new ShadowAtlas({ views: 1 });
        const [first, second] = [
            new DirectionalLight({ castShadow: true }),
            new DirectionalLight({ castShadow: true }),
        ];
        expect(atlas.assign(first.shadowMap!)).toBe(true);
        expect(atlas.assign(second.shadowMap!)).toBe(false);
        const built = (light: DirectionalLight) =>
            light
                .getSceneContributions()
                .filter((c) => c.point === lightVisibilityPoint || c.point === lightThicknessPoint)
                .map((c) => c.build(() => 0));
        expect(built(first).every((m) => m !== undefined)).toBe(true);
        expect(built(second)).toEqual([undefined, undefined]);
        // A faixa liberada é dela: passa a contribuir.
        atlas.release(first.shadowMap!);
        atlas.assign(second.shadowMap!);
        expect(built(second).every((m) => m !== undefined)).toBe(true);
        expect(built(first)).toEqual([undefined, undefined]);
    });

    it.each([2, 3])(
        '%i luzes com sombra: a espessura atravessada é por luz — cada contribuição só a da sua, desconhecida para as demais (spec 013, T026)',
        (count) => {
            // Arrange + Act
            const modules = shadowModules(count, lightThicknessPoint);
            // Assert: cada módulo desconhece (x < 0) a espessura das outras luzes e lê o referencial do seu mapa.
            expect(new Set(modules).size).toBe(count);
            modules.forEach((m, k) => {
                expect(m.source).toContain(`if (light != ${3 + k}u) { return vec2f(-1.0, 0.0); }`);
                expect(m.source).toContain(
                    `shadow_virtual_thickness(shadow_matrices[${k}u], p, n, l)`,
                );
            });
            // A composição devolve a do contribuinte que conhece a luz pedida — o único —, na primeira que achar: a ordem
            // dos contribuintes não muda o resultado, e nenhuma luz fica com a espessura de outra.
            const combined = lightThicknessPoint.combine(
                modules.map((m, k) => instantiateModule(m, `_${k}`)),
            );
            for (let k = 0; k < count; k++) {
                expect(combined.source).toContain(`let t${k} = light_thickness_${k}(light, p, n);`);
                expect(combined.source).toContain(`if (t${k}.x >= 0.0) { return t${k}; }`);
            }
            expect(combined.source).not.toContain('var known');
            expect(combined.source.trimEnd().endsWith('return vec2f(-1.0, 0.0);\n}')).toBe(true);
            expect(() => composeWgsl(combined)).not.toThrow();
        },
    );

    it('a luz de foco e a pontual com sombra: a visibilidade e a espessura pela vista em perspectiva delas (spec 013, T033)', () => {
        // Arrange
        const atlas = new ShadowAtlas();
        const spot = new SpotLight({ castShadow: true, radius: 0.05 });
        const point = new PointLight({ castShadow: true });
        atlas.assign(spot.shadowMap!);
        atlas.assign(point.shadowMap!);
        const slots = (p: { name: string }) => (p.name === 'Light' ? 4 : 2);
        const built = (light: SpotLight | PointLight, at: typeof lightVisibilityPoint) =>
            light
                .getSceneContributions()
                .find((c) => c.point === at)!
                .build(slots)!;
        // Assert: a de foco lê a vista dela, com a direção do ponto à luz e o raio da fonte (`cones.w`).
        expect(spot.data.cones[3]).toBeCloseTo(0.05);
        const spotVisibility = built(spot, lightVisibilityPoint);
        expect(spotVisibility.source).toContain('if (light != 4u) { return 1.0; }');
        expect(spotVisibility.source).toContain('let l = normalize(lights[4u].position.xyz - p);');
        expect(spotVisibility.source).toContain('shadow_virtual_visibility(matrix, p, n, l,');
        expect(spotVisibility.source).toContain('lights[4u].cones.w');
        expect(built(spot, lightThicknessPoint).source).toContain(
            'shadow_virtual_thickness(shadow_matrices[2u], p, n, l)',
        );
        // A pontual escolhe a face do cubo pela direção (na leitura do cubo).
        const pointVisibility = built(point, lightVisibilityPoint);
        expect(pointVisibility.source).toContain('shadow_cube_visibility(matrix, p, n, l,');
        expect(built(point, lightThicknessPoint).source).toContain(
            'shadow_cube_thickness(shadow_matrices[2u], p, n, l)',
        );
        for (const m of [spotVisibility, pointVisibility, built(point, lightThicknessPoint)])
            expect(() => composeWgsl(m)).not.toThrow();
        // Com a sombra, também a luz que atravessa a subsuperfície; a face é escolhida pela direção da luz ao ponto.
        expect(spot.getSceneContributions()).toContain(poolTransmittedContribution);
        expect(point.getSceneContributions()).toContain(poolTransmittedContribution);
        const cube = composeWgsl(pointVisibility).spec.source;
        expect(cube).toContain('fn sv_cube_face(d: vec3f) -> u32');
        expect(cube).toContain('sv_face(base, sv_cube_face(lifted - base.origin.xyz))');
    });

    it('a luz de área tem o laço dela (os lobos integrados sobre o retângulo), depois do das outras', () => {
        const rect = new RectLight({
            position: [1, 2, 3, 1],
            direction: [0, -2, 0, 0],
            right: [3, 1, 0],
            size: [2, 0.5],
            intensity: 4,
        });
        // O dado: tipo 3, a normal unitária, as meias medidas e o eixo da largura perpendicular à normal.
        expect(rect.data.kind).toBe(3);
        expect(rect.data.castShadow).toBe(0);
        expect(rect.data.direction).toEqual([0, -1, 0, 0]);
        expect(rect.data.cones).toEqual([1, 0.25, 0, 0]);
        expect(rect.data.axis).toEqual([1, 0, 0, 0]);
        expect(Light.schema.offsetOf('axis')).toBeGreaterThan(Light.schema.offsetOf('cones'));
        // Sem `right`, o eixo do mundo mais afastado da normal.
        expect(new RectLight({ direction: [1, 0, 0, 0] }).data.axis).toEqual([0, 1, 0, 0]);
        for (const light of [new DirectionalLight(), new PointLight(), new SpotLight()])
            expect(light.data.axis).toEqual([0, 0, 0, 0]);
        expect(rect.getSceneContributions()).toEqual([rectLightContribution]);
        expect(rectLightContribution.point).toBe(sceneDirectLightingPoint);
        expect(rectLightContribution.order).toBeGreaterThan(poolLightContribution.order);
        const loop = rectLightContribution.build(() => 0)!;
        expect(loop.source).toContain('lights[i].kind != 3u');
        expect(loop.source).toContain('closure_area_eval(c, n, v, p, rect,');
        expect(loop.source).toContain('light_visibility(i, p, n) * light_transmission(i, p)');
        expect(() => composeWgsl(loop)).not.toThrow();
        // Lida por raio ou por volume, vale pelo centro: a luminância pela área e pelo cosseno.
        expect(lightIncoming.source).toContain('4.0 * light.cones.x * light.cones.y');
    });

    it('o hemisfério contribui depois das luzes, pela transmissão da luz ambiente (NONE)', () => {
        const contributions = new HemisphereLight().getSceneContributions();
        // No desenho, para os meios participantes (spec 033, R12) como radiância média e, para quem traça raios, como o
        // ambiente visto ao escapar (spec 034, T065f) e, quando pedido, o fundo visível (T066), o mesmo: o céu acima do
        // horizonte, o chão abaixo.
        expect(contributions.map((c) => c.point)).toEqual([
            hemisphereContribution.point,
            hemisphereAmbientContribution.point,
            hemisphereEnvironmentContribution.point,
            hemisphereBackgroundContribution(() => true).point,
            hemisphereRayLightingContribution.point,
        ]);
        // Nos acertos dos raios (a refração), a mesma luz ambiente do desenho, num ponto próprio: os raios calculam a
        // luz das fontes com a sombra por raio, sem `scene_direct_lighting`.
        expect(contributions[4]!.point).toBe(sceneAmbientLightingPoint);
        const drawn = hemisphereContribution.build(() => undefined)!;
        const traced = contributions[4]!.build(() => undefined)!;
        expect(traced).toBe(hemisphereRayLightingContribution.build(() => undefined));
        expect(traced.source).toContain(
            'fn scene_ambient_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f',
        );
        expect(traced.source).toContain('return hemisphere_lighting(c, p, n, v);');
        expect(drawn.source).toContain('return hemisphere_lighting(c, p, n, v);');
        expect(traced.requires).toEqual(drawn.requires);
        expect(() => composeWgsl(traced)).not.toThrow();
        expect(sceneAmbientLightingReady.source).toContain('return vec3f(0.0);');
        expect(contributions[0]!.order).toBe(hemisphereContribution.order);
        expect(contributions[0]!.build(() => undefined)).toBe(
            hemisphereContribution.build(() => undefined),
        );
        expect(contributions[1]!.build(() => undefined)).toBe(
            hemisphereAmbientContribution.build(() => undefined),
        );
        expect(contributions[2]).toBe(hemisphereEnvironmentContribution);
        // Sem `lighting` (os estágios padrão com a iluminação global, spec 034): a luz ambiente constante sai das
        // superfícies e dos meios; o ambiente dos raios que escapam fica.
        const env = new HemisphereLight();
        env.lighting = false;
        const off = env.getSceneContributions();
        expect(off[0]!.build(() => undefined)).toBeUndefined();
        expect(off[1]!.build(() => undefined)).toBeUndefined();
        expect(off[4]!.build(() => undefined)).toBeUndefined();
        expect(off[2]).toBe(hemisphereEnvironmentContribution);
        expect(contributions[3]!.point).toBe(hemisphereBackgroundContribution(() => true).point);
        // O fundo só com `background` (padrão desligado: a cor da limpeza); trocável depois de criado.
        expect(contributions[3]!.build(() => undefined)).toBeUndefined();
        const sky = new HemisphereLight({ background: true });
        expect(sky.background).toBe(true);
        expect(sky.getSceneContributions()[3]!.build(() => undefined)).toBe(hemisphereBackground);
        sky.background = false;
        expect(sky.getSceneContributions()[3]!.build(() => undefined)).toBeUndefined();
        const environment = hemisphereEnvironmentContribution.build(() => undefined)!;
        const background = hemisphereBackground;
        expect(environment.source).toContain('fn scene_environment(dir: vec3f) -> vec3f');
        expect(environment.source).toContain('return hemisphere_radiance(dir);');
        expect(background.source).toContain('fn scene_background(dir: vec3f) -> vec3f');
        expect(background.source).toContain('return hemisphere_radiance(dir);');
        expect(environment.requires).toEqual(background.requires);
        expect(environment.requires[0]!.source).toContain(
            'select(hemisphere.groundColor.rgb, hemisphere.skyColor.rgb, dot(dir, up) >= 0.0) * hemisphere.intensity',
        );
        expect(() => composeWgsl(environment)).not.toThrow();
        expect(() => composeWgsl(background)).not.toThrow();
        expect(hemisphereAmbientContribution.build(() => undefined)!.source).toContain(
            'fn scene_ambient(p: vec3f) -> vec3f',
        );
        expect(hemisphereContribution.order).toBeGreaterThan(poolLightContribution.order);
        const m = hemisphereContribution.build(() => undefined)!;
        // O corpo é o do módulo comum ao desenho e aos acertos dos raios (`hemisphere_lighting`).
        expect(m.source).toContain('return hemisphere_lighting(c, p, n, v);');
        const shared = m.requires.find((r) => r.name === 'hemisphere_lighting')!;
        expect(shared.source).toContain('closure_ambient(');
        expect(shared.source).toContain('light_transmission(NONE, p)');
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
