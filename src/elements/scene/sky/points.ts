import { wgslModule } from '../../../scene/shaders/WgslModule';
import type { SceneContribution } from '../../../scene/shaders/WgslPoint';
import {
    lightTransmissionPoint,
    sceneBackgroundPoint,
    sceneEnvironmentPoint,
    skyCoverReady,
} from '../points/lighting';
import { sky, skyParamsResource } from './shaders';

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
 * (`covered`, spec 041), o ambiente lê `sky_cover`; sem, o módulo de antes (o mesmo WGSL).
 */
export function skyContributions(covered: () => boolean): readonly SceneContribution[] {
    return [
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
