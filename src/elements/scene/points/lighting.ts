import { wgslModule, type WgslModule } from '../../../scene/shaders/WgslModule';
import type { ContributionPoint } from '../../../scene/shaders/WgslPoint';
import { DEFAULT_LIGHT_DIRECTION } from '../../gpu/shaders/constants';

// Pontos de cena do sombreamento (spec 031, R4): o desenho chama estas funções sem conhecer quem as implementa. Sem
// contribuinte, fica o pronto; a luz que projeta sombra (`DirectionalLight` com `ShadowMap`) e a água (`WaterSurface`)
// contribuem. Cada ponto recebe o valor que o desenho já calculou, para que a conta seja a mesma de antes.

/** `fn scene_light_direction() -> vec3f` — direção da luz que ilumina; pronto: a direção padrão. */
export const sceneLightDirectionReady = wgslModule({
    name: 'scene_light_direction_ready',
    requires: [DEFAULT_LIGHT_DIRECTION.module],
    source: 'fn scene_light_direction() -> vec3f {\n    return DEFAULT_LIGHT_DIRECTION;\n}',
});

/**
 * `fn scene_any_light_direction() -> vec3f` — direção da primeira luz viva da cena, com ou sem sombra (a luz dos sprites
 * de partículas); pronto, sem luz: a direção padrão.
 */
export const sceneAnyLightDirectionReady = wgslModule({
    name: 'scene_any_light_direction_ready',
    requires: [DEFAULT_LIGHT_DIRECTION.module],
    source: 'fn scene_any_light_direction() -> vec3f {\n    return DEFAULT_LIGHT_DIRECTION;\n}',
});

/** `fn light_visibility(p: vec3f, n_dot_l: f32) -> f32` — visibilidade da luz no ponto; pronto: 1 (sem sombra). */
export const lightVisibilityReady = wgslModule({
    name: 'light_visibility_ready',
    source: 'fn light_visibility(p: vec3f, n_dot_l: f32) -> f32 {\n    return 1.0;\n}',
});

/**
 * `fn light_transmission(p: vec3f, ambient: f32, direct: f32) -> vec3f` — a luz que chega ao ponto: o ambiente mais a
 * direta `direct` (já atenuada pela sombra) depois de atravessar o meio (ex.: a água e as cáusticas); pronto:
 * `vec3f(ambient + direct)`. O contribuinte devolve a soma inteira, para a conta ser a mesma de antes em cada ramo.
 */
export const lightTransmissionReady = wgslModule({
    name: 'light_transmission_ready',
    source: 'fn light_transmission(p: vec3f, ambient: f32, direct: f32) -> vec3f {\n    return vec3f(ambient + direct);\n}',
});

const combined = new Map<string, WgslModule>();

function memo(key: string, make: () => WgslModule): WgslModule {
    let m = combined.get(key);
    if (m === undefined) combined.set(key, (m = make()));
    return m;
}

/** Direção da luz da cena: o primeiro contribuinte (a ordem decide). */
export const sceneLightDirectionPoint: ContributionPoint = {
    name: 'scene_light_direction',
    ready: sceneLightDirectionReady,
    functionName: 'scene_light_direction',
    combine: (modules) =>
        memo(`dir:${modules.map((m) => m.name).join('+')}`, () =>
            wgslModule({
                name: `scene_light_direction:${modules.map((m) => m.name).join('+')}`,
                requires: modules,
                source: 'fn scene_light_direction() -> vec3f {\n    return scene_light_direction_0();\n}',
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
                source: `fn light_visibility(p: vec3f, n_dot_l: f32) -> f32 {\n    return ${modules
                    .map((_, k) => `light_visibility_${k}(p, n_dot_l)`)
                    .join(' * ')};\n}`,
            }),
        ),
};

/** Transmissão da luz: o primeiro contribuinte com o ambiente e a direta; os seguintes como fatores (sem ambiente). */
export const lightTransmissionPoint: ContributionPoint = {
    name: 'light_transmission',
    ready: lightTransmissionReady,
    functionName: 'light_transmission',
    combine: (modules) =>
        memo(`trans:${modules.map((m) => m.name).join('+')}`, () =>
            wgslModule({
                name: `light_transmission:${modules.map((m) => m.name).join('+')}`,
                requires: modules,
                source: `fn light_transmission(p: vec3f, ambient: f32, direct: f32) -> vec3f {\n    return ${modules
                    .map((_, k) =>
                        k === 0
                            ? 'light_transmission_0(p, ambient, direct)'
                            : `light_transmission_${k}(p, 0.0, 1.0)`,
                    )
                    .join(' * ')};\n}`,
            }),
        ),
};

/** Direção da primeira luz viva: todo contribuinte entrega o mesmo módulo (vale o primeiro). */
export const sceneAnyLightDirectionPoint: ContributionPoint = {
    name: 'scene_any_light_direction',
    ready: sceneAnyLightDirectionReady,
    functionName: 'scene_any_light_direction',
    combine: (modules) =>
        memo(`any:${modules.map((m) => m.name).join('+')}`, () =>
            wgslModule({
                name: `scene_any_light_direction:${modules.map((m) => m.name).join('+')}`,
                requires: modules,
                source: 'fn scene_any_light_direction() -> vec3f {\n    return scene_any_light_direction_0();\n}',
            }),
        ),
};
