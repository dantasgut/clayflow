import { wgslModule } from '../../../scene/shaders/WgslModule';
import { wgslResource } from '../../../scene/shaders/WgslResource';
import type { SceneContribution } from '../../../scene/shaders/WgslPoint';
import { constants } from '../../gpu/shaders/math';
import environmentMapSource from '../../gpu/wgsl/environment/environment_map.wgsl?raw';
import { sceneBackgroundPoint, sceneEnvironmentPoint } from '../points/lighting';
import { EnvironmentMapSchema } from './schema';

// A imagem do mundo (spec 039 refeita): os recursos (resolvers `EnvironmentMap.*`), a amostragem e as contribuições ao
// ambiente dos raios e ao fundo.

/** Parâmetros (resolver `EnvironmentMap.params`). */
export const environmentParamsResource = wgslResource({
    name: 'environment',
    binding: { uniform: true },
    type: { schema: EnvironmentMapSchema },
    frequency: 'frame',
    provider: { consumer: 'EnvironmentMap.params' },
});

/** A imagem (resolver `EnvironmentMap.image`). */
export const environmentImageResource = wgslResource({
    name: 'environment_image',
    binding: { texture: { sample: 'f32' } },
    frequency: 'frame',
    provider: { consumer: 'EnvironmentMap.image' },
});

/** O amostrador com filtro, repetido na horizontal (resolver `EnvironmentMap.sampler`). */
export const environmentSamplerResource = wgslResource({
    name: 'environment_sampler',
    binding: { sampler: 'filtering' },
    frequency: 'frame',
    provider: { consumer: 'EnvironmentMap.sampler' },
});

/** A radiância da imagem numa direção. */
export const environmentMap = wgslModule({
    name: 'environment_map',
    source: environmentMapSource,
    requires: [
        constants,
        environmentParamsResource,
        environmentImageResource,
        environmentSamplerResource,
    ],
});

/** A imagem como ambiente dos raios que escapam. */
const environmentScene = wgslModule({
    name: 'environment_scene_environment',
    requires: [environmentMap],
    source: `fn scene_environment(dir: vec3f) -> vec3f {
    return environment_radiance(dir);
}`,
});

/** A imagem como fundo visível. */
const environmentBackground = wgslModule({
    name: 'environment_scene_background',
    requires: [environmentMap],
    source: `fn scene_background(dir: vec3f) -> vec3f {
    return environment_radiance(dir);
}`,
});

/** Contribuições de um `EnvironmentMap`: o ambiente sempre; o fundo quando `background()`. */
export function environmentContributions(background: () => boolean): readonly SceneContribution[] {
    return [
        { point: sceneEnvironmentPoint, order: 10, pools: [], build: () => environmentScene },
        {
            point: sceneBackgroundPoint,
            order: 10,
            pools: [],
            build: () => (background() ? environmentBackground : undefined),
        },
    ];
}
