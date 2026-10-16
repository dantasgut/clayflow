import { wgslModule, type WgslModule } from '../../../scene/shaders/WgslModule';
import type { SceneContribution } from '../../../scene/shaders/WgslPoint';
import { brdf } from '../../gpu/shaders/math';
import { Light } from '../Light';
import { ShadowMap } from '../ShadowMap';
import {
    lightsResource,
    shadowCasterDepthResource,
    shadowCasterSamplerResource,
    shadowMapsResource,
    shadowMatricesResource,
} from '../resources';
import { lightVisibilityPoint, sceneLightDirectionPoint } from './lighting';

const directions = new Map<number, WgslModule>();
const visibilities = new Map<number, WgslModule>();

/** Direção da luz que projeta sombra: a do slot dela no pool `Light`. */
function directionModule(lightSlot: number): WgslModule {
    let m = directions.get(lightSlot);
    if (m === undefined) {
        m = wgslModule({
            name: `scene_light_direction_caster_${lightSlot}`,
            requires: [lightsResource],
            source: `fn scene_light_direction() -> vec3f {\n    return lights[${lightSlot}u].direction.xyz;\n}`,
        });
        directions.set(lightSlot, m);
    }
    return m;
}

/** Visibilidade pela sombra (PCF 3×3) do mapa no slot `shadowSlot`. */
function visibilityModule(shadowSlot: number): WgslModule {
    let m = visibilities.get(shadowSlot);
    if (m === undefined) {
        m = wgslModule({
            name: `light_visibility_shadow_${shadowSlot}`,
            requires: [
                brdf,
                shadowMapsResource,
                shadowMatricesResource,
                shadowCasterDepthResource,
                shadowCasterSamplerResource,
            ],
            source: `fn light_visibility(p: vec3f, n_dot_l: f32) -> f32 {
    let sm = shadow_maps[${shadowSlot}u];
    let light_view_proj = shadow_matrices[${shadowSlot}u].lightViewProj;
    return sample_shadow_pcf(shadow_map, shadow_sampler, light_view_proj, p, sm.bias, 1.0, n_dot_l);
}`,
        });
        visibilities.set(shadowSlot, m);
    }
    return m;
}

/**
 * Contribuições da luz direcional que projeta sombra (spec 031, R4): a direção dela para `scene_light_direction` e a
 * sombra do seu mapa para `light_visibility`, pelos slots da entidade nos pools `Light` e `ShadowMap`. Sem projetar
 * (`castShadow` 0) ou sem slot ainda, não contribui.
 */
export function shadowCasterContributions(casting: () => boolean): readonly SceneContribution[] {
    return [
        {
            point: sceneLightDirectionPoint,
            order: 0,
            pools: [Light.schema, ShadowMap.schema],
            build: (slotOf) => {
                const light = slotOf(Light.schema);
                const shadow = slotOf(ShadowMap.schema);
                return !casting() || light === undefined || shadow === undefined
                    ? undefined
                    : directionModule(light);
            },
        },
        {
            point: lightVisibilityPoint,
            order: 0,
            pools: [Light.schema, ShadowMap.schema],
            build: (slotOf) => {
                const light = slotOf(Light.schema);
                const shadow = slotOf(ShadowMap.schema);
                return !casting() || light === undefined || shadow === undefined
                    ? undefined
                    : visibilityModule(shadow);
            },
        },
    ];
}
