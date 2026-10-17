import { wgslModule } from '../../../scene/shaders/WgslModule';
import type { SceneContribution } from '../../../scene/shaders/WgslPoint';
import {
    lightTransmissionPoint,
    sceneBackgroundPoint,
    sceneEnvironmentPoint,
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

/** Contribuições do `Sky` (spec 033, R4): a transmitância do sol, o fundo e o ambiente. */
export const skyContributions: readonly SceneContribution[] = [
    { point: lightTransmissionPoint, order: 20, pools: [], build: () => skyLightTransmission },
    { point: sceneBackgroundPoint, order: 0, pools: [], build: () => skyBackground },
    { point: sceneEnvironmentPoint, order: 0, pools: [], build: () => skyEnvironment },
];
