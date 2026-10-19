import { wgslModule } from '../../../scene/shaders/WgslModule';
import type { ContributionPoint } from '../../../scene/shaders/WgslPoint';

// Ponto de cena da refração (spec 034, US7): o desenho dos transmissivos lê a luz que atravessa a primeira interface no
// pixel sem saber quem a calcula (a refração traçada da `GlobalIllumination`).

/**
 * `fn scene_refraction(pixel: vec2u) -> vec4f` — a radiância por baixo da primeira interface transmissiva vista no
 * pixel (rgb: sem o Fresnel dela, que é do desenho; com as interfaces seguintes, a absorção e a luz da superfície que não
 * transmite) e se vale (a = 1); pronto: nada (a = 0).
 */
export const sceneRefractionReady = wgslModule({
    name: 'scene_refraction_ready',
    source: 'fn scene_refraction(pixel: vec2u) -> vec4f {\n    return vec4f(0.0);\n}',
});

/** Refração da cena: um só contribuinte (o último, se houver mais). */
export const sceneRefractionPoint: ContributionPoint = {
    name: 'scene_refraction',
    ready: sceneRefractionReady,
    functionName: 'scene_refraction',
    combine: (modules) =>
        wgslModule({
            name: `scene_refraction:${modules.map((m) => m.name).join('+')}`,
            requires: modules,
            source: `fn scene_refraction(pixel: vec2u) -> vec4f {\n    return scene_refraction_${modules.length - 1}(pixel);\n}`,
        }),
};
