import { wgslModule } from '../../../scene/shaders/WgslModule';
import type { SceneContribution } from '../../../scene/shaders/WgslPoint';
import {
    lightTransmissionPoint,
    sceneBackgroundPoint,
    sceneEnvironmentPoint,
    skyCoverReady,
} from '../points/lighting';
import {
    sky,
    skyAerialLookup,
    skyAerialShadowLut,
    skyAmbientTexture,
    skyParamsResource,
    skySampler,
} from './shaders';
import { camerasResource } from '../resources';
import { viewSpace } from '../../gpu/shaders/math';
import { NONE } from '../../../scene/shaders/engineConstants';
import { closure, closureEval } from '../../material/pbr/shaders';
import { sceneDirectLightingPoint, lightTransmissionReady } from '../points/lighting';
import {
    SCENE_FOG_BACKGROUND,
    sceneAmbientPoint,
    sceneFogPoint,
    sceneFogType,
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
): readonly SceneContribution[] {
    return [
        // Atrás da névoa dos volumes (ordem 0): a composição "na frente de" põe a névoa na frente.
        {
            point: sceneFogPoint,
            order: 10,
            pools: [],
            build: () => (aerial() ? skyFog : undefined),
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
            build: () => (aerial() && shadowed() ? skyBackgroundShadowed : skyBackground),
        },
        {
            point: sceneEnvironmentPoint,
            order: 0,
            pools: [],
            build: () => (covered() ? skyEnvironmentCovered : skyEnvironment),
        },
    ];
}
