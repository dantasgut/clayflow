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
