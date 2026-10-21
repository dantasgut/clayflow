import { wgslModule, type WgslModule } from '../../../scene/shaders/WgslModule';
import type { ContributionPoint } from '../../../scene/shaders/WgslPoint';
import { closure } from '../../material/pbr/shaders';

// Pontos de cena do sombreamento (spec 031, R4; spec 011, R7): o desenho chama estas funções sem conhecer quem as
// implementa. As luzes contribuem para `scene_direct_lighting` e a luz rebatida para `scene_indirect_lighting` (somas;
// `scene_lighting` é as duas); a sombra de cada luz para `light_visibility` e a água para `light_transmission`
// (produtos, por luz). Sem contribuinte, fica o pronto.

/**
 * `fn scene_direct_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f` — a radiância refletida para `v` pelo
 * fechamento `c` no ponto `p` (normal `n`) sob as luzes analíticas da cena (as do pool, com a sombra e o meio, e o
 * hemisfério); pronto: nenhuma luz (0).
 */
export const sceneDirectLightingReady = wgslModule({
    name: 'scene_direct_lighting_ready',
    requires: [closure],
    source: 'fn scene_direct_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f {\n    return vec3f(0.0);\n}',
});

/**
 * `fn scene_indirect_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f` — a radiância refletida para `v` sob a
 * luz rebatida (spec 033: as sondas e as cáusticas); pronto: nenhuma (0).
 */
export const sceneIndirectLightingReady = wgslModule({
    name: 'scene_indirect_lighting_ready',
    requires: [closure],
    source: 'fn scene_indirect_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f {\n    return vec3f(0.0);\n}',
});

/**
 * `fn scene_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f` — a radiância refletida para `v` sob toda a
 * luz da cena: a direta mais a rebatida. O desenho com o antisserrilhado temporal lê as duas em separado (spec 034: a
 * luz que muda sobre a superfície parada é a direta; o ruído da rebatida tem o acúmulo próprio).
 */
export const sceneLightingReady = wgslModule({
    name: 'scene_lighting',
    requires: [closure, sceneDirectLightingReady, sceneIndirectLightingReady],
    source: `fn scene_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f {
    return scene_direct_lighting(c, p, n, v) + scene_indirect_lighting(c, p, n, v);
}`,
});

/**
 * `fn light_visibility(light: u32, p: vec3f, n: vec3f) -> f32` — visibilidade da luz `light` (slot no pool `Light`,
 * ou `NONE` para a ambiente) no ponto de normal `n` (0 num ponto de volume); pronto: 1 (sem sombra).
 */
export const lightVisibilityReady = wgslModule({
    name: 'light_visibility_ready',
    source: 'fn light_visibility(light: u32, p: vec3f, n: vec3f) -> f32 {\n    return 1.0;\n}',
});

/**
 * `fn light_transmission(light: u32, p: vec3f) -> vec3f` — o fator do meio que a luz `light` atravessa até o ponto (ex.:
 * a água e as cáusticas); pronto: 1.
 */
export const lightTransmissionReady = wgslModule({
    name: 'light_transmission_ready',
    source: 'fn light_transmission(light: u32, p: vec3f) -> vec3f {\n    return vec3f(1.0);\n}',
});

/**
 * `fn scene_environment(dir: vec3f) -> vec3f` — a radiância do ambiente vinda da direção `dir` (unitária, mundo): o que
 * um raio que escapa da cena vê (spec 033: o céu físico); pronto: nada (0).
 */
export const sceneEnvironmentReady = wgslModule({
    name: 'scene_environment_ready',
    source: 'fn scene_environment(dir: vec3f) -> vec3f {\n    return vec3f(0.0);\n}',
});

/**
 * `fn scene_background(dir: vec3f) -> vec3f` — o fundo visível na direção `dir` (spec 033: o céu com o disco do sol); o
 * desenho só o pinta quando há contribuinte (pronto: 0, o fundo fica o da limpeza).
 */
export const sceneBackgroundReady = wgslModule({
    name: 'scene_background_ready',
    source: 'fn scene_background(dir: vec3f) -> vec3f {\n    return vec3f(0.0);\n}',
});

const combined = new Map<string, WgslModule>();

function memo(key: string, make: () => WgslModule): WgslModule {
    let m = combined.get(key);
    if (m === undefined) combined.set(key, (m = make()));
    return m;
}

/** Ponto de iluminação de nome `name`: a soma das contribuições, em ordem. */
function lightingPoint(name: string, ready: WgslModule): ContributionPoint {
    return {
        name,
        ready,
        functionName: name,
        combine: (modules) =>
            memo(`${name}:${modules.map((m) => m.name).join('+')}`, () =>
                wgslModule({
                    name: `${name}:${modules.map((m) => m.name).join('+')}`,
                    requires: [closure, ...modules],
                    source: `fn ${name}(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f {\n    return ${modules
                        .map((_, k) => `${name}_${k}(c, p, n, v)`)
                        .join(' + ')};\n}`,
                }),
            ),
    };
}

/** Luz direta da cena: a soma das contribuições (cada classe de luz, o hemisfério). */
export const sceneDirectLightingPoint = lightingPoint(
    'scene_direct_lighting',
    sceneDirectLightingReady,
);

/** Luz rebatida da cena: a soma das contribuições (a iluminação global). */
export const sceneIndirectLightingPoint = lightingPoint(
    'scene_indirect_lighting',
    sceneIndirectLightingReady,
);

/** Visibilidade da luz: o produto dos contribuintes, em ordem. */
export const lightVisibilityPoint: ContributionPoint = {
    name: 'light_visibility',
    ready: lightVisibilityReady,
    functionName: 'light_visibility',
    combine: (modules) =>
        memo(`vis:${modules.map((m) => m.name).join('+')}`, () =>
            wgslModule({
                name: `light_visibility:${modules.map((m) => m.name).join('+')}`,
                requires: modules,
                source: `fn light_visibility(light: u32, p: vec3f, n: vec3f) -> f32 {\n    return ${modules
                    .map((_, k) => `light_visibility_${k}(light, p, n)`)
                    .join(' * ')};\n}`,
            }),
        ),
};

/** Transmissão da luz: o produto dos contribuintes, em ordem. */
export const lightTransmissionPoint: ContributionPoint = {
    name: 'light_transmission',
    ready: lightTransmissionReady,
    functionName: 'light_transmission',
    combine: (modules) =>
        memo(`trans:${modules.map((m) => m.name).join('+')}`, () =>
            wgslModule({
                name: `light_transmission:${modules.map((m) => m.name).join('+')}`,
                requires: modules,
                source: `fn light_transmission(light: u32, p: vec3f) -> vec3f {\n    return ${modules
                    .map((_, k) => `light_transmission_${k}(light, p)`)
                    .join(' * ')};\n}`,
            }),
        ),
};

/** Soma de contribuintes de um ponto de direção (`fn <name>(dir: vec3f) -> vec3f`). */
function sumOfDirection(name: string): ContributionPoint['combine'] {
    return (modules) =>
        memo(`${name}:${modules.map((m) => m.name).join('+')}`, () =>
            wgslModule({
                name: `${name}:${modules.map((m) => m.name).join('+')}`,
                requires: modules,
                source: `fn ${name}(dir: vec3f) -> vec3f {\n    return ${modules
                    .map((_, k) => `${name}_${k}(dir)`)
                    .join(' + ')};\n}`,
            }),
        );
}

/** Ambiente da cena (raios que escapam): a soma dos contribuintes. */
export const sceneEnvironmentPoint: ContributionPoint = {
    name: 'scene_environment',
    ready: sceneEnvironmentReady,
    functionName: 'scene_environment',
    combine: sumOfDirection('scene_environment'),
};

/** Fundo visível da cena: a soma dos contribuintes. */
export const sceneBackgroundPoint: ContributionPoint = {
    name: 'scene_background',
    ready: sceneBackgroundReady,
    functionName: 'scene_background',
    combine: sumOfDirection('scene_background'),
};
