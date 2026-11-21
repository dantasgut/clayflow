import { wgslModule, type WgslModule } from '../../../scene/shaders/WgslModule';
import type { ContributionPoint } from '../../../scene/shaders/WgslPoint';
import { sharedConstant } from '../../../scene/shaders/SharedConstant';
import { NONE } from '../../../scene/shaders/engineConstants';

// Pontos de cena dos meios participantes (spec 033, R12): quem desenha uma superfície chama `scene_fog` no ponto dela
// (a névoa entre a câmera e o ponto) sem conhecer quem a implementa — os froxels dos `FogVolume` e a perspectiva aérea do
// `Sky` (spec 041, atrás da névoa); quem ilumina um
// ponto do meio (os froxels) chama `scene_ambient` (a radiância média que chega de todas as direções) sem conhecer a
// luz ambiente — o hemisfério ou as sondas da iluminação global; quem sombreia uma superfície sólida chama
// `scene_wetness` (a película de água nela e a água nos poros dela, spec 034) e quem refrata nela `scene_wetness_slope`
// (a inclinação dessa película) sem conhecer quem a simula. Sem contribuinte, fica o pronto.

/**
 * O que `scene_fog` devolve (spec 041): a luz espalhada para a câmera no caminho (`scattered`) e a transmitância do
 * caminho por canal (`transmittance`: a da atmosfera é cromática — o Rayleigh tira mais o azul). Quem desenha compõe
 * `cor · transmittance + scattered`.
 */
export const sceneFogType = wgslModule({
    name: 'scene_fog_type',
    source: 'struct SceneFog {\n    scattered: vec3f,\n    transmittance: vec3f,\n}',
});

/**
 * Distância (m) do ponto que quem desenha o fundo (nenhuma superfície) passa a `scene_fog`: o fundo está no infinito,
 * além de toda a névoa; um contribuinte cujo meio já está na luz do fundo (a atmosfera, na vista do céu) não soma nada a
 * partir de metade dela.
 */
export const SCENE_FOG_BACKGROUND = sharedConstant('SCENE_FOG_BACKGROUND', 1e7, 'f32');

/**
 * `fn scene_fog(p: vec3f) -> SceneFog` — o que há entre a câmera ativa e o ponto `p` (mundo): a névoa dos volumes, a
 * atmosfera (spec 041); pronto: nada (`SceneFog(0, 1)`).
 */
export const sceneFogReady = wgslModule({
    name: 'scene_fog_ready',
    requires: [sceneFogType],
    source: 'fn scene_fog(p: vec3f) -> SceneFog {\n    return SceneFog(vec3f(0.0), vec3f(1.0));\n}',
});

/**
 * `fn scene_ambient(p: vec3f) -> vec3f` — a radiância média que chega ao ponto `p` de todas as direções, sem as luzes do
 * pool (que quem chama soma com a sombra delas): o hemisfério, a luz rebatida; pronto: nada (0).
 */
export const sceneAmbientReady = wgslModule({
    name: 'scene_ambient_ready',
    source: 'fn scene_ambient(p: vec3f) -> vec3f {\n    return vec3f(0.0);\n}',
});

/**
 * `fn scene_wetness(p: vec3f, n: vec3f, footprint: f32) -> vec2f` — a água no ponto `p` de uma superfície sólida de
 * normal `n` (spec 034): a espessura da película livre (x, m) e a saturação dos poros (y, em [0, 1]), média na largura
 * `footprint` (m) que o pixel cobre ali (0: no ponto); quem sombreia a superfície a molha (`closure_wet`); pronto: seca
 * (0, 0).
 */
export const sceneWetnessReady = wgslModule({
    name: 'scene_wetness_ready',
    source: 'fn scene_wetness(p: vec3f, n: vec3f, footprint: f32) -> vec2f {\n    return vec2f(0.0);\n}',
});

/**
 * `fn scene_wetness_slope(p: vec3f, n: vec3f, footprint: f32) -> vec4f` — a inclinação da água no ponto `p` de uma
 * superfície sólida de normal `n` (spec 034, T066d): o gradiente da espessura dela no plano da superfície (xyz, m/m) e
 * a curvatura da superfície da água ali (w, 1/m: a da calota da gota), média na largura `footprint` (m) que o pixel
 * cobre ali (0: no ponto) — a face de fora da água é a normal menos o gradiente; quem refrata no sólido entorta o raio
 * por ela e abre o cone dele pela curvatura (a gota é uma lente); pronto: plana (0).
 */
export const sceneWetnessSlopeReady = wgslModule({
    name: 'scene_wetness_slope_ready',
    source: 'fn scene_wetness_slope(p: vec3f, n: vec3f, footprint: f32) -> vec4f {\n    return vec4f(0.0);\n}',
});

/**
 * `fn scene_wetness_moving(p: vec3f, n: vec3f, footprint: f32) -> bool` — o que se vê pela água no ponto `p` da
 * superfície sólida de normal `n` (na largura `footprint` do pixel ali) muda de um quadro para o outro (spec 034, T066d:
 * a cabeça do filete que desce; a gota parada, a faixa do filete e a película presa, não): quem guarda entre quadros o
 * que vê por ela não guarda ali; pronto: parada (`false`).
 */
export const sceneWetnessMovingReady = wgslModule({
    name: 'scene_wetness_moving_ready',
    source: 'fn scene_wetness_moving(p: vec3f, n: vec3f, footprint: f32) -> bool {\n    return false;\n}',
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
                requires: [sceneFogType, ...modules],
                source: `fn scene_fog(p: vec3f) -> SceneFog {
    var fog = SceneFog(vec3f(0.0), vec3f(1.0));
${modules
    .map(
        (_, k) => `    let f${k} = scene_fog_${k}(p);
    fog = SceneFog(fog.scattered + fog.transmittance * f${k}.scattered, fog.transmittance * f${k}.transmittance);`,
    )
    .join('\n')}
    return fog;
}`,
            }),
        ),
};

/**
 * O meio contínuo da cena num ponto (spec 041, R21): a extinção (rgb, 1/m) e a luz que ele espalha para quem olha na
 * direção `view` (rgb, radiância por metro: a luz simples das fontes dele, já com a sombra delas, e a múltipla), e a
 * visibilidade da fonte `light` que ele calculou no ponto sorteado (`light_visibility`, a sombra do terreno e dos objetos;
 * `NONE` quando não calculou nenhuma) — quem integra o meio junto com volumes de névoa reusa essa leitura para a mesma
 * fonte no mesmo ponto, em vez de refazê-la.
 */
export const sceneMediumType = wgslModule({
    name: 'scene_medium_type',
    requires: [NONE.module],
    source: 'struct SceneMedium {\n    extinction: vec3f,\n    radiance: vec3f,\n    light: u32,\n    visibility: f32,\n}',
});

/**
 * `fn scene_medium(p: vec3f, center: vec3f, view: vec3f) -> SceneMedium` — o meio que enche o espaço em volta da câmera
 * (a atmosfera do `Sky`, spec 041 R21) numa célula de quem o integra: o meio (a densidade, as fases, a luz que chega sem
 * sombra) no centro `center` dela, a visibilidade das fontes (as sombras: as bordas dos feixes) no ponto sorteado `p`,
 * visto na direção `view` (unitária, da câmera para o centro). A parte lisa sem ruído e só a sombra amostrada: o acúmulo
 * temporal faz a média dela na célula. Quem integra os meios perto da câmera (os froxels) o soma aos volumes de névoa e
 * reusa a sombra que ele leu (`light`, `visibility`) para a mesma fonte no mesmo ponto; pronto: nada.
 */
export const sceneMediumReady = wgslModule({
    name: 'scene_medium_ready',
    requires: [sceneMediumType],
    source: 'fn scene_medium(p: vec3f, center: vec3f, view: vec3f) -> SceneMedium {\n    return SceneMedium(vec3f(0.0), vec3f(0.0), NONE, 1.0);\n}',
});

/**
 * `fn scene_medium_open(p: vec3f, view: vec3f) -> SceneMedium` — o mesmo meio no ponto `p` sem nenhuma sombra das fontes
 * dele (spec 041, R21 rodada 16): a extinção e a luz que ele espalha para quem olha na direção `view` como se nada
 * tapasse as fontes — o que a vista do céu integra; quem integra perto o soma à parte para tirar exatamente esse trecho
 * do céu, na mesma resolução; pronto: nada.
 */
export const sceneMediumOpenReady = wgslModule({
    name: 'scene_medium_open_ready',
    requires: [sceneMediumType],
    source: 'fn scene_medium_open(p: vec3f, view: vec3f) -> SceneMedium {\n    return SceneMedium(vec3f(0.0), vec3f(0.0), NONE, 1.0);\n}',
});

/**
 * O que `scene_near_fog` devolve (spec 041, R21): os meios integrados perto da câmera até o ponto (`fog`: a luz
 * espalhada e a transmitância dos volumes de névoa) e até onde, ao longo do raio da câmera para o ponto, eles já
 * integram o meio contínuo de `scene_medium` (`reach`, m; 0 quando não o integram), e a luz que o meio contínuo espalharia
 * nesse trecho sem nenhuma sombra (`open`, rgb, atenuada só por ele até a câmera: o que a vista do céu tem desse trecho).
 */
export const sceneNearFogType = wgslModule({
    name: 'scene_near_fog_type',
    requires: [sceneFogType],
    source: 'struct SceneNearFog {\n    fog: SceneFog,\n    reach: f32,\n    open: vec3f,\n}',
});

/**
 * `fn scene_near_fog(p: vec3f) -> SceneNearFog` — os meios perto da câmera ativa entre ela e `p` (os froxels) e até
 * onde eles integram o meio contínuo: quem soma o resto do meio além deles (a perspectiva aérea do `Sky`, a marcha
 * das nuvens) começa ali, sem contar a luz duas vezes; pronto: nada e alcance 0.
 */
export const sceneNearFogReady = wgslModule({
    name: 'scene_near_fog_ready',
    requires: [sceneNearFogType],
    source: 'fn scene_near_fog(p: vec3f) -> SceneNearFog {\n    return SceneNearFog(SceneFog(vec3f(0.0), vec3f(1.0)), 0.0, vec3f(0.0));\n}',
});

/** Meio contínuo: a soma dos contribuintes (extinção e luz espalhada somam; a visibilidade é a do primeiro que a calculou). */
export const sceneMediumPoint: ContributionPoint = {
    name: 'scene_medium',
    ready: sceneMediumReady,
    functionName: 'scene_medium',
    combine: (modules) =>
        memo(`medium:${modules.map((m) => m.name).join('+')}`, () =>
            wgslModule({
                name: `scene_medium:${modules.map((m) => m.name).join('+')}`,
                requires: [sceneMediumType, ...modules],
                source: `fn scene_medium(p: vec3f, center: vec3f, view: vec3f) -> SceneMedium {
    var m = SceneMedium(vec3f(0.0), vec3f(0.0), NONE, 1.0);
${modules
    .map(
        (_, k) => `    let m${k} = scene_medium_${k}(p, center, view);
    let v${k} = m.light == NONE && m${k}.light != NONE;
    m = SceneMedium(m.extinction + m${k}.extinction, m.radiance + m${k}.radiance, select(m.light, m${k}.light, v${k}),
        select(m.visibility, m${k}.visibility, v${k}));`,
    )
    .join('\n')}
    return m;
}`,
            }),
        ),
};

/** O meio contínuo sem sombras: a soma dos contribuintes. */
export const sceneMediumOpenPoint: ContributionPoint = {
    name: 'scene_medium_open',
    ready: sceneMediumOpenReady,
    functionName: 'scene_medium_open',
    combine: (modules) =>
        memo(`medium_open:${modules.map((m) => m.name).join('+')}`, () =>
            wgslModule({
                name: `scene_medium_open:${modules.map((m) => m.name).join('+')}`,
                requires: [sceneMediumType, ...modules],
                source: `fn scene_medium_open(p: vec3f, view: vec3f) -> SceneMedium {
    var m = SceneMedium(vec3f(0.0), vec3f(0.0), NONE, 1.0);
${modules
    .map(
        (_, k) => `    let m${k} = scene_medium_open_${k}(p, view);
    m = SceneMedium(m.extinction + m${k}.extinction, m.radiance + m${k}.radiance, NONE, 1.0);`,
    )
    .join('\n')}
    return m;
}`,
            }),
        ),
};

/** Meios perto da câmera: os contribuintes em ordem, cada um à frente do seguinte; o alcance é o maior. */
export const sceneNearFogPoint: ContributionPoint = {
    name: 'scene_near_fog',
    ready: sceneNearFogReady,
    functionName: 'scene_near_fog',
    combine: (modules) =>
        memo(`near_fog:${modules.map((m) => m.name).join('+')}`, () =>
            wgslModule({
                name: `scene_near_fog:${modules.map((m) => m.name).join('+')}`,
                requires: [sceneNearFogType, ...modules],
                source: `fn scene_near_fog(p: vec3f) -> SceneNearFog {
    var near = SceneNearFog(SceneFog(vec3f(0.0), vec3f(1.0)), 0.0, vec3f(0.0));
${modules
    .map(
        (_, k) => `    let n${k} = scene_near_fog_${k}(p);
    near = SceneNearFog(SceneFog(near.fog.scattered + near.fog.transmittance * n${k}.fog.scattered,
        near.fog.transmittance * n${k}.fog.transmittance), max(near.reach, n${k}.reach), near.open + n${k}.open);`,
    )
    .join('\n')}
    return near;
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

/** Água na superfície: a maior película e a maior saturação dos contribuintes. */
export const sceneWetnessPoint: ContributionPoint = {
    name: 'scene_wetness',
    ready: sceneWetnessReady,
    functionName: 'scene_wetness',
    combine: (modules) =>
        memo(`wetness:${modules.map((m) => m.name).join('+')}`, () =>
            wgslModule({
                name: `scene_wetness:${modules.map((m) => m.name).join('+')}`,
                requires: modules,
                source: `fn scene_wetness(p: vec3f, n: vec3f, footprint: f32) -> vec2f {\n    return max(${modules
                    .map((_, k) => `scene_wetness_${k}(p, n, footprint)`)
                    .reduce((a, b) => `max(${a}, ${b})`)}, vec2f(0.0));\n}`,
            }),
        ),
};

/** Inclinação da película: a soma dos contribuintes (as películas de cada um se sobrepõem). */
export const sceneWetnessSlopePoint: ContributionPoint = {
    name: 'scene_wetness_slope',
    ready: sceneWetnessSlopeReady,
    functionName: 'scene_wetness_slope',
    combine: (modules) =>
        memo(`wetness_slope:${modules.map((m) => m.name).join('+')}`, () =>
            wgslModule({
                name: `scene_wetness_slope:${modules.map((m) => m.name).join('+')}`,
                requires: modules,
                source: `fn scene_wetness_slope(p: vec3f, n: vec3f, footprint: f32) -> vec4f {\n    return ${modules
                    .map((_, k) => `scene_wetness_slope_${k}(p, n, footprint)`)
                    .join(' + ')};\n}`,
            }),
        ),
};

/** A água correndo no ponto: algum contribuinte a vê correr. */
export const sceneWetnessMovingPoint: ContributionPoint = {
    name: 'scene_wetness_moving',
    ready: sceneWetnessMovingReady,
    functionName: 'scene_wetness_moving',
    combine: (modules) =>
        memo(`wetness_moving:${modules.map((m) => m.name).join('+')}`, () =>
            wgslModule({
                name: `scene_wetness_moving:${modules.map((m) => m.name).join('+')}`,
                requires: modules,
                source: `fn scene_wetness_moving(p: vec3f, n: vec3f, footprint: f32) -> bool {\n    return ${modules
                    .map((_, k) => `scene_wetness_moving_${k}(p, n, footprint)`)
                    .join(' || ')};\n}`,
            }),
        ),
};
