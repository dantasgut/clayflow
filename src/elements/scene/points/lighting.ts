import { wgslModule, type WgslModule } from '../../../scene/shaders/WgslModule';
import type { ContributionPoint } from '../../../scene/shaders/WgslPoint';
import { closure } from '../../material/pbr/shaders';

// Pontos de cena do sombreamento (spec 031, R4; spec 011, R7): o desenho chama estas funções sem conhecer quem as
// implementa. As luzes contribuem para `scene_lighting` (soma); a sombra de cada luz para `light_visibility` e a água
// para `light_transmission` (produtos, por luz). Sem contribuinte, fica o pronto.

/**
 * `fn scene_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f` — a radiância refletida para `v` pelo fechamento
 * `c` no ponto `p` (normal `n`) sob todas as luzes da cena; pronto: nenhuma luz (0).
 */
export const sceneLightingReady = wgslModule({
    name: 'scene_lighting_ready',
    requires: [closure],
    source: 'fn scene_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f {\n    return vec3f(0.0);\n}',
});

/**
 * `fn light_visibility(light: u32, p: vec3f, n_dot_l: f32) -> f32` — visibilidade da luz `light` (slot no pool `Light`,
 * ou `NONE` para a ambiente) no ponto; pronto: 1 (sem sombra).
 */
export const lightVisibilityReady = wgslModule({
    name: 'light_visibility_ready',
    source: 'fn light_visibility(light: u32, p: vec3f, n_dot_l: f32) -> f32 {\n    return 1.0;\n}',
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

/** Iluminação da cena: a soma das contribuições (cada classe de luz, o hemisfério). */
export const sceneLightingPoint: ContributionPoint = {
    name: 'scene_lighting',
    ready: sceneLightingReady,
    functionName: 'scene_lighting',
    combine: (modules) =>
        memo(`light:${modules.map((m) => m.name).join('+')}`, () =>
            wgslModule({
                name: `scene_lighting:${modules.map((m) => m.name).join('+')}`,
                requires: [closure, ...modules],
                source: `fn scene_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f {\n    return ${modules
                    .map((_, k) => `scene_lighting_${k}(c, p, n, v)`)
                    .join(' + ')};\n}`,
            }),
        ),
};

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
                source: `fn light_visibility(light: u32, p: vec3f, n_dot_l: f32) -> f32 {\n    return ${modules
                    .map((_, k) => `light_visibility_${k}(light, p, n_dot_l)`)
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
