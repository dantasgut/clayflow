import { wgslModule, type WgslModule } from '../../../scene/shaders/WgslModule';
import type { ContributionPoint } from '../../../scene/shaders/WgslPoint';

// Pontos de cena dos meios participantes (spec 033, R12): quem desenha uma superfície chama `scene_fog` no ponto dela
// (a névoa entre a câmera e o ponto) sem conhecer quem a implementa — hoje os froxels dos `FogVolume`; quem ilumina um
// ponto do meio (os froxels) chama `scene_ambient` (a radiância média que chega de todas as direções) sem conhecer a
// luz ambiente — o hemisfério ou as sondas da iluminação global. Sem contribuinte, fica o pronto.

/**
 * `fn scene_fog(p: vec3f) -> vec4f` — a névoa entre a câmera ativa e o ponto `p` (mundo): a luz espalhada para a câmera
 * no caminho (rgb) e a transmitância do caminho (a). Quem desenha compõe `cor · a + rgb`; pronto: sem névoa
 * (`vec4f(0, 0, 0, 1)`).
 */
export const sceneFogReady = wgslModule({
    name: 'scene_fog_ready',
    source: 'fn scene_fog(p: vec3f) -> vec4f {\n    return vec4f(0.0, 0.0, 0.0, 1.0);\n}',
});

/**
 * `fn scene_ambient(p: vec3f) -> vec3f` — a radiância média que chega ao ponto `p` de todas as direções, sem as luzes do
 * pool (que quem chama soma com a sombra delas): o hemisfério, a luz rebatida; pronto: nada (0).
 */
export const sceneAmbientReady = wgslModule({
    name: 'scene_ambient_ready',
    source: 'fn scene_ambient(p: vec3f) -> vec3f {\n    return vec3f(0.0);\n}',
});

const combined = new Map<string, WgslModule>();

function memo(key: string, make: () => WgslModule): WgslModule {
    let m = combined.get(key);
    if (m === undefined) combined.set(key, (m = make()));
    return m;
}

/**
 * Névoa da cena: os contribuintes em ordem, cada um à frente do seguinte (o espalhado de trás atenuado pela
 * transmitância da frente).
 */
export const sceneFogPoint: ContributionPoint = {
    name: 'scene_fog',
    ready: sceneFogReady,
    functionName: 'scene_fog',
    combine: (modules) =>
        memo(`fog:${modules.map((m) => m.name).join('+')}`, () =>
            wgslModule({
                name: `scene_fog:${modules.map((m) => m.name).join('+')}`,
                requires: modules,
                source: `fn scene_fog(p: vec3f) -> vec4f {
    var fog = vec4f(0.0, 0.0, 0.0, 1.0);
${modules
    .map(
        (_, k) => `    let f${k} = scene_fog_${k}(p);
    fog = vec4f(fog.rgb + fog.a * f${k}.rgb, fog.a * f${k}.a);`,
    )
    .join('\n')}
    return fog;
}`,
            }),
        ),
};

/** Radiância ambiente: a soma dos contribuintes. */
export const sceneAmbientPoint: ContributionPoint = {
    name: 'scene_ambient',
    ready: sceneAmbientReady,
    functionName: 'scene_ambient',
    combine: (modules) =>
        memo(`ambient:${modules.map((m) => m.name).join('+')}`, () =>
            wgslModule({
                name: `scene_ambient:${modules.map((m) => m.name).join('+')}`,
                requires: modules,
                source: `fn scene_ambient(p: vec3f) -> vec3f {\n    return ${modules
                    .map((_, k) => `scene_ambient_${k}(p)`)
                    .join(' + ')};\n}`,
            }),
        ),
};
