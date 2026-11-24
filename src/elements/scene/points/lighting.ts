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
 * `fn scene_caustic_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f` — a radiância refletida para `v` pela
 * luz que chegou ao ponto por caminhos especulares (spec 034, T067c: as cáusticas) — a que os acertos dos raios (a
 * refração, a luz rebatida) somam à luz direta das fontes (o desenho a recebe em `scene_direct_lighting`); pronto: 0.
 */
export const sceneCausticLightingReady = wgslModule({
    name: 'scene_caustic_lighting_ready',
    requires: [closure],
    source: 'fn scene_caustic_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f {\n    return vec3f(0.0);\n}',
});

/**
 * `fn scene_ambient_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f` — a radiância refletida para `v` sob a
 * luz ambiente sem oclusão da cena (o hemisfério; o céu sem a iluminação global) — a que os acertos dos raios (a
 * refração) somam à luz direta das fontes, que eles calculam com a sombra por raio (o desenho a recebe em
 * `scene_direct_lighting`); pronto: 0. Sem ela, o ponto opaco visto por um raio ficava só com as fontes: preto do lado
 * contra a luz, onde o mesmo ponto desenhado tem a luz ambiente.
 */
export const sceneAmbientLightingReady = wgslModule({
    name: 'scene_ambient_lighting_ready',
    requires: [closure],
    source: 'fn scene_ambient_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f {\n    return vec3f(0.0);\n}',
});

/**
 * `fn scene_transmitted_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f` — a luz que chega ao ponto `p` por
 * dentro do corpo, vinda das fontes do lado oposto à normal `n` (spec 011, T113: a subsuperfície pelas partes finas — a
 * orelha contra o sol), como irradiância sobre π, já atenuada pelo perfil de difusão do fechamento `c` na espessura
 * atravessada (`light_thickness`). Lida só pelo passe de subsuperfície do desenho; pronto: nenhuma (0).
 */
export const sceneTransmittedLightingReady = wgslModule({
    name: 'scene_transmitted_lighting_ready',
    requires: [closure],
    source: 'fn scene_transmitted_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f {\n    return vec3f(0.0);\n}',
});

/**
 * `fn light_thickness(light: u32, p: vec3f, n: vec3f) -> vec2f` — o corpo entre a luz `light` (slot no pool `Light`) e o
 * ponto `p` de normal `n`: x a espessura atravessada ao longo da direção da luz, em unidades do mundo, e y o cosseno da
 * luz na superfície por onde ela entra; x < 0 quando ninguém sabe (a luz sem mapa de sombra). Pronto: ninguém sabe.
 */
export const lightThicknessReady = wgslModule({
    name: 'light_thickness_ready',
    source: 'fn light_thickness(light: u32, p: vec3f, n: vec3f) -> vec2f {\n    return vec2f(-1.0, 0.0);\n}',
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
 * `fn light_volume_visibility(light: u32, p: vec3f) -> vec3f` — o que tapa a luz `light` num ponto de um meio
 * participante (spec 041, R21: o ar dos froxels), além do próprio meio contínuo e da sombra da geometria
 * (`light_visibility`): as nuvens, a névoa dos volumes. Quem chama acumula no tempo (os froxels), e o contribuinte pode
 * dar uma amostra por quadro da penumbra no lugar da média dela; pronto: nada tapa (1).
 */
export const lightVolumeVisibilityReady = wgslModule({
    name: 'light_volume_visibility_ready',
    source: 'fn light_volume_visibility(light: u32, p: vec3f) -> vec3f {\n    return vec3f(1.0);\n}',
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

/**
 * `fn sky_cover(dir: vec3f) -> vec4f` — o que cobre o céu na direção `dir` (spec 041: as nuvens): a luz espalhada para
 * quem olha (rgb) e a transmitância (a); quem lê o céu compõe `céu · a + rgb`. Pronto: nada cobre (`vec4f(0, 0, 0, 1)`).
 */
export const skyCoverReady = wgslModule({
    name: 'sky_cover_ready',
    source: 'fn sky_cover(dir: vec3f) -> vec4f {\n    return vec4f(0.0, 0.0, 0.0, 1.0);\n}',
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

/** Luz das cáusticas nos acertos dos raios: a soma das contribuições. */
export const sceneCausticLightingPoint = lightingPoint(
    'scene_caustic_lighting',
    sceneCausticLightingReady,
);

/** Luz ambiente sem oclusão nos acertos dos raios: a soma das contribuições (o hemisfério, o céu sem a GI). */
export const sceneAmbientLightingPoint = lightingPoint(
    'scene_ambient_lighting',
    sceneAmbientLightingReady,
);

/** Luz que atravessa o corpo até o ponto (a subsuperfície pelas partes finas): a soma das contribuições. */
export const sceneTransmittedLightingPoint = lightingPoint(
    'scene_transmitted_lighting',
    sceneTransmittedLightingReady,
);

/** Espessura atravessada pela luz: a do contribuinte que a conhece (o mapa de sombra da luz), em ordem. */
export const lightThicknessPoint: ContributionPoint = {
    name: 'light_thickness',
    ready: lightThicknessReady,
    functionName: 'light_thickness',
    combine: (modules) =>
        memo(`thickness:${modules.map((m) => m.name).join('+')}`, () =>
            wgslModule({
                name: `light_thickness:${modules.map((m) => m.name).join('+')}`,
                requires: modules,
                source: `fn light_thickness(light: u32, p: vec3f, n: vec3f) -> vec2f {
    var known = vec2f(-1.0, 0.0);
${modules
    .map(
        (_, k) => `    let t${k} = light_thickness_${k}(light, p, n);
    if (t${k}.x >= 0.0) { known = t${k}; }`,
    )
    .join('\n')}
    return known;
}`,
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
                source: `fn light_visibility(light: u32, p: vec3f, n: vec3f) -> f32 {\n    return ${modules
                    .map((_, k) => `light_visibility_${k}(light, p, n)`)
                    .join(' * ')};\n}`,
            }),
        ),
};

/** Transmissão da luz: o produto dos contribuintes, em ordem. */
/** O que tapa a luz num ponto de meio participante: o produto dos contribuintes. */
export const lightVolumeVisibilityPoint: ContributionPoint = {
    name: 'light_volume_visibility',
    ready: lightVolumeVisibilityReady,
    functionName: 'light_volume_visibility',
    combine: (modules) =>
        memo(`volume_vis:${modules.map((m) => m.name).join('+')}`, () =>
            wgslModule({
                name: `light_volume_visibility:${modules.map((m) => m.name).join('+')}`,
                requires: modules,
                source: `fn light_volume_visibility(light: u32, p: vec3f) -> vec3f {\n    return ${modules
                    .map((_, k) => `light_volume_visibility_${k}(light, p)`)
                    .join(' * ')};\n}`,
            }),
        ),
};

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

/**
 * O que cobre o céu (spec 041, R12): os contribuintes em ordem, cada um na frente do seguinte (o espalhado de trás
 * atenuado pela transmitância da frente), como `scene_fog`.
 */
export const skyCoverPoint: ContributionPoint = {
    name: 'sky_cover',
    ready: skyCoverReady,
    functionName: 'sky_cover',
    combine: (modules) =>
        memo(`cover:${modules.map((m) => m.name).join('+')}`, () =>
            wgslModule({
                name: `sky_cover:${modules.map((m) => m.name).join('+')}`,
                requires: modules,
                source: `fn sky_cover(dir: vec3f) -> vec4f {
    var cover = vec4f(0.0, 0.0, 0.0, 1.0);
${modules
    .map(
        (_, k) => `    let c${k} = sky_cover_${k}(dir);
    cover = vec4f(cover.rgb + cover.a * c${k}.rgb, cover.a * c${k}.a);`,
    )
    .join('\n')}
    return cover;
}`,
            }),
        ),
};
