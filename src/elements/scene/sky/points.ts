import { wgslModule } from '../../../scene/shaders/WgslModule';
import type { SceneContribution } from '../../../scene/shaders/WgslPoint';
import {
    lightTransmissionPoint,
    sceneBackgroundPoint,
    sceneEnvironmentPoint,
    skyCoverReady,
} from '../points/lighting';
import {
    SKY_AERIAL_RANGE,
    sky,
    skyAerialLookup,
    skyAerialShadowLut,
    skyAerialShadowFarLut,
    skyAmbientTexture,
    skyAtmosphere,
    skyLookup,
    skyParamsResource,
    skySampler,
} from './shaders';
import { camerasResource } from '../resources';
import { viewSpace } from '../../gpu/shaders/math';
import { NONE } from '../../../scene/shaders/engineConstants';
import { closure, closureEval } from '../../material/pbr/shaders';
import {
    sceneDirectLightingPoint,
    lightTransmissionReady,
    lightVisibilityReady,
    lightVolumeVisibilityReady,
} from '../points/lighting';
import {
    SCENE_FOG_BACKGROUND,
    sceneAmbientPoint,
    sceneFogPoint,
    sceneFogType,
    sceneMediumOpenPoint,
    sceneMediumPoint,
    sceneMediumType,
    sceneNearFogReady,
} from '../points/media';

/** A luz do sol atenuada pela atmosfera (as outras luzes passam sem mudança). */
const skyLightTransmission = wgslModule({
    name: 'sky_light_transmission',
    requires: [sky, skyParamsResource],
    source: `fn light_transmission(light: u32, p: vec3f) -> vec3f {
    if (light == sky.sunSlot) { return sky_sun_transmittance(p); }
    return vec3f(1.0);
}`,
});

/** O céu (com o disco do sol) como fundo da cena. */
const skyBackground = wgslModule({
    name: 'sky_scene_background',
    requires: [sky],
    source: `fn scene_background(dir: vec3f) -> vec3f {
    return sky_background(dir);
}`,
});

/**
 * O céu com a sombra do que tapa o sol no ar (spec 041, raios crepusculares): a vista do céu integra a atmosfera sem
 * sombra; o déficit da tabela da perspectiva aérea (a luz simples que o ar sombreado deixa de espalhar até o fim da
 * atmosfera, por coluna da tela da câmera ativa) sai dela. A direção projetada pela câmera ativa: o fundo da câmera cai
 * na tela; a de um raio refletido ou refratado perto da câmera, fora da tela, lê a coluna da borda, e o déficit some a
 * meia tela além dela (atrás da câmera, nada) — o ar que esse raio atravessa é o mesmo que a câmera vê na mesma direção.
 */
const skyBackgroundShadowed = wgslModule({
    name: 'sky_scene_background_shadowed',
    requires: [sky, skyParamsResource, skyAerialShadowLut, skySampler, camerasResource, viewSpace],
    source: `fn scene_background(dir: vec3f) -> vec3f {
    let l = sky_background(dir);
    let c = cameras[sky.cameraSlot].unjitteredViewProjection * vec4f(dir, 0.0);
    if (c.w <= 1e-6) { return l; }
    let uv = ndc_to_uv(c.xy / c.w);
    let outside = max(max(-uv.x, uv.x - 1.0), max(-uv.y, uv.y - 1.0));
    let fade = 1.0 - smoothstep(0.0, 0.5, outside);
    let deficit = textureSampleLevel(sky_aerial_shadow_lut, sky_sampler, clamp(uv, vec2f(0.0), vec2f(1.0)), 0.0).rgb;
    return max(l - deficit * sky.sunIlluminance.rgb * fade, vec3f(0.0));
}`,
});

/**
 * O fundo com a sombra no ar e os froxels integrando o trecho perto (spec 041, R21 rodada 16): só o déficit além do
 * alcance da tabela — o de perto já está nos froxels (com as sombras finas).
 */
const skyBackgroundShadowedFar = wgslModule({
    name: 'sky_scene_background_shadowed_far',
    requires: [
        sky,
        skyParamsResource,
        skyAerialShadowFarLut,
        skySampler,
        camerasResource,
        viewSpace,
    ],
    source: `fn scene_background(dir: vec3f) -> vec3f {
    let l = sky_background(dir);
    let c = cameras[sky.cameraSlot].unjitteredViewProjection * vec4f(dir, 0.0);
    if (c.w <= 1e-6) { return l; }
    let uv = ndc_to_uv(c.xy / c.w);
    let outside = max(max(-uv.x, uv.x - 1.0), max(-uv.y, uv.y - 1.0));
    let fade = 1.0 - smoothstep(0.0, 0.5, outside);
    let deficit = textureSampleLevel(sky_aerial_shadow_far_lut, sky_sampler, clamp(uv, vec2f(0.0), vec2f(1.0)), 0.0).rgb;
    return max(l - deficit * sky.sunIlluminance.rgb * fade, vec3f(0.0));
}`,
});

/** O céu como ambiente dos raios que escapam (sem o disco do sol: a luz do sol é direta). */
const skyEnvironment = wgslModule({
    name: 'sky_scene_environment',
    requires: [sky],
    source: `fn scene_environment(dir: vec3f) -> vec3f {
    return sky_radiance(dir);
}`,
});

/**
 * O céu coberto (spec 041, R12): o que está na frente dele numa direção (`sky_cover`, composição "na frente de": as
 * nuvens) tapa a radiância do céu e soma a própria luz.
 */
const skyEnvironmentCovered = wgslModule({
    name: 'sky_scene_environment_covered',
    requires: [sky, skyCoverReady],
    source: `fn scene_environment(dir: vec3f) -> vec3f {
    let cover = sky_cover(dir);
    return sky_radiance(dir) * cover.a + cover.rgb;
}`,
});

/**
 * A perspectiva aérea (spec 041, R10, R13): a atmosfera entre a câmera ativa e o ponto, pela tabela 32³ na coluna da
 * tela dele (a luz espalhada, em unidades da iluminância do sol, e a transmitância por canal). Atrás da névoa dos
 * volumes (ordem maior: composta depois dela). O fundo (o ponto a `SCENE_FOG_BACKGROUND`) não recebe nada: a
 * atmosfera inteira já está na vista do céu.
 */
const skyFog = wgslModule({
    name: 'sky_scene_fog',
    requires: [
        sceneFogType,
        SCENE_FOG_BACKGROUND.module,
        skyAerialLookup,
        skyParamsResource,
        camerasResource,
        viewSpace,
    ],
    source: `fn scene_fog(p: vec3f) -> SceneFog {
    let cam = cameras[sky.cameraSlot];
    let v = p - cam.position.xyz;
    let d = length(v);
    if (d <= 0.0 || d >= 0.5 * SCENE_FOG_BACKGROUND) { return SceneFog(vec3f(0.0), vec3f(1.0)); }
    let c = cam.unjitteredViewProjection * vec4f(p, 1.0);
    let uv = clamp(ndc_to_uv(c.xy / max(c.w, 1e-6)), vec2f(0.0), vec2f(1.0));
    // O ar acaba no chão do planeta: um ponto abaixo dele (a cena abaixo da altitude 0) lê a tabela no chão, onde a
    // coluna dele termina — as colunas vizinhas, que a leitura interpola, terminam em outras distâncias.
    let r0 = sky_bottom() + max(sky.radii.w + cam.position.y * 0.001, 0.001);
    let a = sky_aerial(uv, v / d, min(d, sky_segment(r0, v.y / d) * 1000.0));
    return SceneFog(a.scattered * sky.sunIlluminance.rgb, a.transmittance);
}`,
});

/**
 * O ponto do ar no sistema do planeta (km, centro na origem, +y para cima) como a tabela da perspectiva aérea o vê: o
 * centro do planeta sob a câmera ativa. Dentro da atmosfera e até o alcance da tabela (spec 041, R21: o meio perto da
 * câmera vai até ele; a tabela soma o resto); fora, `w` = 0.
 */
const skyMediumFrame = wgslModule({
    name: 'sky_medium_frame',
    requires: [SKY_AERIAL_RANGE.module, skyAtmosphere, skyParamsResource, camerasResource],
    source: `fn sky_medium_frame(p: vec3f) -> vec4f {
    let cam = cameras[sky.cameraSlot];
    let v = (p - cam.position.xyz) * 0.001;
    let r0 = sky_bottom() + max(sky.radii.w + cam.position.y * 0.001, 0.001);
    let x = vec3f(0.0, r0, 0.0) + v;
    let inside = dot(v, v) <= SKY_AERIAL_RANGE * SKY_AERIAL_RANGE && length(x) >= sky_bottom()
        && length(x) <= sky_top();
    return vec4f(x, select(0.0, 1.0, inside));
}`,
});

/**
 * A atmosfera como meio dos froxels (spec 041, R21): no centro da célula, a extinção de Rayleigh, Mie, névoa seca e
 * ozônio, e a luz que ele espalha para a câmera — a simples do sol (as fases de Rayleigh e de Cornette-Shanks, a
 * transmitância da atmosfera até o sol pela curvatura do planeta, como a tabela) × o que mais a tapa no ar
 * (`light_volume_visibility`: as nuvens, uma amostra da penumbra por quadro; a névoa dos volumes) × a sombra do terreno e
 * dos objetos (`light_visibility`, o mapa de sombra virtual, com a penumbra do disco do sol), mais a múltipla (Ψms, sem
 * sombra, como a tabela); as sombras no ponto sorteado da célula (a parte lisa no centro dela: sem o ruído da densidade
 * que muda ~13 % numa fatia de 10 % da distância). O mesmo integrando da tabela da perspectiva aérea: a emenda no fim dos
 * froxels não muda de meio. Só até o alcance da tabela.
 */
const skyMedium = wgslModule({
    name: 'sky_scene_medium',
    requires: [
        sceneMediumType,
        skyMediumFrame,
        skyAtmosphere,
        skyLookup,
        skyParamsResource,
        sky,
        lightVolumeVisibilityReady,
        lightVisibilityReady,
    ],
    source: `fn scene_medium(p: vec3f, center: vec3f, view: vec3f) -> SceneMedium {
    let f = sky_medium_frame(center);
    if (f.w == 0.0) { return SceneMedium(vec3f(0.0), vec3f(0.0), NONE, 1.0); }
    let rx = length(f.xyz);
    let m = sky_medium(rx - sky_bottom());
    let mu_s = dot(f.xyz, sky.sunDirection.xyz) / rx;
    let c = dot(view, sky.sunDirection.xyz);
    let free = (m.rayleigh * sky_rayleigh_phase(c) + vec3f(m.mie * sky_mie_phase(c))) * sky_transmittance(rx, mu_s);
    // A sombra do terreno e dos objetos primeiro; a das nuvens (a coluna no mapa visto do sol) só onde o sol chega. A do
    // terreno volta com o meio: a névoa dos volumes no mesmo ponto não a refaz para o sol.
    var single = vec3f(0.0);
    var light = NONE;
    var terrain = 1.0;
    if (any(free > vec3f(0.0))) {
        terrain = light_visibility(sky.sunSlot, p, vec3f(0.0));
        light = sky.sunSlot;
        if (terrain > 0.0) { single = free * terrain * light_volume_visibility(sky.sunSlot, p); }
    }
    let multi = m.scattering * sky_multiscatter(rx, mu_s);
    return SceneMedium(m.extinction * 0.001, (single + multi) * sky.sunIlluminance.rgb * 0.001, light, terrain);
}`,
});

/**
 * A atmosfera no ponto do ar sem nenhuma sombra (spec 041, R21 rodada 16: `scene_medium_open`): a extinção e a luz
 * simples e múltipla como a vista do céu as integra, até o alcance da tabela — os froxels somam com ela o trecho perto
 * que o fundo tira da vista do céu, na resolução deles.
 */
const skyMediumOpen = wgslModule({
    name: 'sky_scene_medium_open',
    requires: [sceneMediumType, skyMediumFrame, skyAtmosphere, skyLookup, skyParamsResource],
    source: `fn scene_medium_open(p: vec3f, view: vec3f) -> SceneMedium {
    let f = sky_medium_frame(p);
    if (f.w == 0.0) { return SceneMedium(vec3f(0.0), vec3f(0.0), NONE, 1.0); }
    let rx = length(f.xyz);
    let m = sky_medium(rx - sky_bottom());
    let mu_s = dot(f.xyz, sky.sunDirection.xyz) / rx;
    let c = dot(view, sky.sunDirection.xyz);
    let free = (m.rayleigh * sky_rayleigh_phase(c) + vec3f(m.mie * sky_mie_phase(c))) * sky_transmittance(rx, mu_s);
    let multi = m.scattering * sky_multiscatter(rx, mu_s);
    return SceneMedium(m.extinction * 0.001, (free + multi) * sky.sunIlluminance.rgb * 0.001, NONE, 1.0);
}`,
});

/**
 * A perspectiva aérea além dos meios perto da câmera (spec 041, R21): os froxels integram a atmosfera da câmera até o
 * fim deles (`scene_near_fog`, o alcance ao longo do raio, até o da tabela); a tabela soma só o resto, a diferença da
 * luz espalhada dela entre o fim deles e o ponto — a luz não é contada duas vezes e, no fim dos froxels, a parte longe
 * começa do zero (sem emenda). A transmitância é a da tabela inteira (os froxels guardam só a da névoa dos volumes). No
 * fundo (a atmosfera inteira na vista do céu), tira-se da luz o trecho que os froxels integram (luz espalhada negativa:
 * quem compõe soma).
 */
const skyFogFar = wgslModule({
    name: 'sky_scene_fog_far',
    requires: [
        sceneFogType,
        sceneNearFogReady,
        SCENE_FOG_BACKGROUND.module,
        SKY_AERIAL_RANGE.module,
        skyAerialLookup,
        skyParamsResource,
        camerasResource,
        viewSpace,
    ],
    source: `fn scene_fog(p: vec3f) -> SceneFog {
    let cam = cameras[sky.cameraSlot];
    let v = p - cam.position.xyz;
    let d = length(v);
    if (d <= 0.0) { return SceneFog(vec3f(0.0), vec3f(1.0)); }
    let c = cam.unjitteredViewProjection * vec4f(p, 1.0);
    let uv = clamp(ndc_to_uv(c.xy / max(c.w, 1e-6)), vec2f(0.0), vec2f(1.0));
    let r0 = sky_bottom() + max(sky.radii.w + cam.position.y * 0.001, 0.001);
    // O ar acaba no chão do planeta (como na leitura de sempre).
    let end = sky_segment(r0, v.y / d) * 1000.0;
    let near = scene_near_fog(p);
    let reach = min(min(near.reach, SKY_AERIAL_RANGE * 1000.0), end);
    if (d >= 0.5 * SCENE_FOG_BACKGROUND) {
        // O fundo: a vista do céu tem o trecho perto sem sombra; sai o que os froxels integram dele sem sombra, na
        // resolução deles (rodada 16: a tabela grossa no lugar deixava o azul negativo perto do sol no pôr do sol).
        return SceneFog(-near.open, vec3f(1.0));
    }
    let to = min(d, end);
    let a = sky_aerial(uv, v / d, to);
    let start = sky_aerial(uv, v / d, min(reach, to));
    return SceneFog(max(a.scattered - start.scattered, vec3f(0.0)) * sky.sunIlluminance.rgb, a.transmittance);
}`,
});

/**
 * Contribuições do `Sky` (spec 033, R4): a transmitância do sol, o fundo e o ambiente — com algo cobrindo o céu
 * (`covered`, spec 041), o ambiente lê `sky_cover`; sem, o módulo de antes (o mesmo WGSL). Com `lights` (sem iluminação
 * global, spec 041), a luz do céu nas superfícies e nos meios.
 */
/**
 * A luz do céu nas superfícies sem iluminação global (spec 041): o céu e o chão médios do `SkyAmbientFlow` (o céu
 * coberto pelas nuvens incluso) pelo `closure_ambient`, atenuados pelo meio da luz ambiente.
 */
const skyLighting = wgslModule({
    name: 'scene_lighting_sky',
    requires: [closure, closureEval, NONE.module, skyAmbientTexture, lightTransmissionReady],
    source: `fn scene_direct_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f {
    let up = textureLoad(sky_ambient_tex, vec2u(0u, 0u), 0).rgb;
    let down = textureLoad(sky_ambient_tex, vec2u(1u, 0u), 0).rgb;
    return closure_ambient(c, n, v, up, down, vec3f(0.0, 1.0, 0.0)) * light_transmission(NONE, p);
}`,
});

/** A luz do céu como radiância média de todas as direções (o que os meios espalham). */
const skyAmbient = wgslModule({
    name: 'scene_ambient_sky',
    requires: [NONE.module, skyAmbientTexture, lightTransmissionReady],
    source: `fn scene_ambient(p: vec3f) -> vec3f {
    let up = textureLoad(sky_ambient_tex, vec2u(0u, 0u), 0).rgb;
    let down = textureLoad(sky_ambient_tex, vec2u(1u, 0u), 0).rgb;
    return 0.5 * (up + down) * light_transmission(NONE, p);
}`,
});

export function skyContributions(
    covered: () => boolean,
    lights: () => boolean = () => false,
    aerial: () => boolean = () => false,
    shadowed: () => boolean = () => false,
    near: () => boolean = () => false,
): readonly SceneContribution[] {
    return [
        // Atrás da névoa dos volumes (ordem 0): a composição "na frente de" põe a névoa na frente. Com a atmosfera nos
        // froxels (spec 041, R21), só o trecho além deles.
        {
            point: sceneFogPoint,
            order: 10,
            pools: [],
            build: () => (aerial() ? (near() ? skyFogFar : skyFog) : undefined),
        },
        // A atmosfera como meio dos froxels perto da câmera (spec 041, R21), com a tabela escrita (a câmera ativa).
        {
            point: sceneMediumPoint,
            order: 10,
            pools: [],
            build: () => (aerial() ? skyMedium : undefined),
        },
        {
            point: sceneMediumOpenPoint,
            order: 10,
            pools: [],
            build: () => (aerial() ? skyMediumOpen : undefined),
        },
        {
            point: sceneDirectLightingPoint,
            order: 10,
            pools: [],
            build: () => (lights() ? skyLighting : undefined),
        },
        {
            point: sceneAmbientPoint,
            order: 10,
            pools: [],
            build: () => (lights() ? skyAmbient : undefined),
        },
        { point: lightTransmissionPoint, order: 20, pools: [], build: () => skyLightTransmission },
        {
            point: sceneBackgroundPoint,
            order: 0,
            pools: [],
            // O déficit da sombra no fundo só com algo que tapa o sol no ar (sem isso ele é zero).
            build: () =>
                aerial() && shadowed()
                    ? near()
                        ? skyBackgroundShadowedFar
                        : skyBackgroundShadowed
                    : skyBackground,
        },
        {
            point: sceneEnvironmentPoint,
            order: 0,
            pools: [],
            build: () => (covered() ? skyEnvironmentCovered : skyEnvironment),
        },
    ];
}
