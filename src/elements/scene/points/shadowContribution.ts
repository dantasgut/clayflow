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
import { lightVisibilityPoint } from './lighting';

const visibilities = new Map<string, WgslModule>();

/** Visibilidade da luz no slot `lightSlot` pela sombra (PCF 3×3 girado no quadro) do mapa no slot `shadowSlot`; as outras luzes: 1. */
function visibilityModule(lightSlot: number, shadowSlot: number): WgslModule {
    const key = `${lightSlot}:${shadowSlot}`;
    let m = visibilities.get(key);
    if (m === undefined) {
        m = wgslModule({
            name: `light_visibility_shadow_${lightSlot}_${shadowSlot}`,
            requires: [
                brdf,
                lightsResource,
                shadowMapsResource,
                shadowMatricesResource,
                shadowCasterDepthResource,
                shadowCasterSamplerResource,
            ],
            source: `fn light_visibility(light: u32, p: vec3f, n: vec3f) -> f32 {
    if (light != ${lightSlot}u) { return 1.0; }
    let sm = shadow_maps[${shadowSlot}u];
    let matrix = shadow_matrices[${shadowSlot}u];
    let l = -normalize(lights[${lightSlot}u].direction.xyz);
    return sample_shadow_pcf(shadow_map, shadow_sampler, matrix.lightViewProj, p, n, l, sm.bias, sm.normalBias, matrix.kernelRotation, 1.0);
}`,
        });
        visibilities.set(key, m);
    }
    return m;
}

/**
 * Contribuição da luz direcional que projeta sombra (spec 031, R4; spec 011, R7) ao ponto `light_visibility`: a sombra
 * do seu mapa vale só para ela (pelo slot no pool `Light`); as outras luzes passam inteiras. Sem projetar (`castShadow`
 * 0) ou sem slot ainda, não contribui.
 */
export function shadowCasterContributions(casting: () => boolean): readonly SceneContribution[] {
    return [
        {
            point: lightVisibilityPoint,
            order: 0,
            pools: [Light.schema, ShadowMap.schema],
            build: (slotOf) => {
                const light = slotOf(Light.schema);
                const shadow = slotOf(ShadowMap.schema);
                return !casting() || light === undefined || shadow === undefined
                    ? undefined
                    : visibilityModule(light, shadow);
            },
        },
    ];
}
