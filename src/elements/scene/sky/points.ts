import { wgslModule } from '../../../scene/shaders/WgslModule';
import type { SceneContribution } from '../../../scene/shaders/WgslPoint';
import {
    lightTransmissionPoint,
    sceneBackgroundPoint,
    sceneEnvironmentPoint,
    skyCoverReady,
} from '../points/lighting';
import { sky, skyAmbientTexture, skyParamsResource } from './shaders';
import { NONE } from '../../../scene/shaders/engineConstants';
import { closure, closureEval } from '../../material/pbr/shaders';
import { sceneDirectLightingPoint, lightTransmissionReady } from '../points/lighting';
import { sceneAmbientPoint } from '../points/media';

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
): readonly SceneContribution[] {
    return [
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
        { point: sceneBackgroundPoint, order: 0, pools: [], build: () => skyBackground },
        {
            point: sceneEnvironmentPoint,
            order: 0,
            pools: [],
            build: () => (covered() ? skyEnvironmentCovered : skyEnvironment),
        },
    ];
}
