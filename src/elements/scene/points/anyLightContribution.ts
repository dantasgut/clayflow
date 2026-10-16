import { wgslModule } from '../../../scene/shaders/WgslModule';
import { wgslResource } from '../../../scene/shaders/WgslResource';
import type { SceneContribution } from '../../../scene/shaders/WgslPoint';
import { poolLive } from '../../gpu/compute/shaders';
import { DEFAULT_LIGHT_DIRECTION } from '../../gpu/shaders/constants';
import { Light } from '../Light';
import { lightsResource } from '../resources';
import { sceneAnyLightDirectionPoint } from './lighting';

/** Bitset de slots vivos do pool `Light` (resolver `Light.live`). */
const lightLiveResource = wgslResource({
    name: 'light_live',
    binding: { storage: 'read' },
    type: { wgsl: 'u32', array: true },
    frequency: 'frame',
    provider: { consumer: `${Light.schema.name}.live` },
});

/** A primeira luz viva do pool `Light`, lida na GPU (sem luz viva: a direção padrão). */
const anyLightDirection = wgslModule({
    name: 'scene_any_light_direction_pool',
    requires: [poolLive, DEFAULT_LIGHT_DIRECTION.module, lightsResource, lightLiveResource],
    source: `fn scene_any_light_direction() -> vec3f {
    let n = arrayLength(&lights);
    for (var i = 0u; i < n; i++) {
        if (pool_live(light_live[i >> 5u], i)) {
            return lights[i].direction.xyz;
        }
    }
    return DEFAULT_LIGHT_DIRECTION;
}`,
});

/**
 * Contribuição de toda luz (spec 031, R4) ao ponto `scene_any_light_direction`: a primeira luz viva do pool, com ou sem
 * sombra — a luz dos sprites de partículas, que não conhecem o pool de luzes.
 */
export const anyLightContribution: SceneContribution = {
    point: sceneAnyLightDirectionPoint,
    order: 0,
    pools: [],
    build: () => anyLightDirection,
};
