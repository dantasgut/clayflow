import { wgslModule, type WgslModule } from '../../../scene/shaders/WgslModule';
import type { SceneContribution } from '../../../scene/shaders/WgslPoint';
import { shadowVirtualRead, shadowVirtualThickness } from './shaders';
import { Light } from '../Light';
import { ShadowMap } from '../ShadowMap';
import { lightsResource, shadowMapsResource, shadowMatricesResource } from '../resources';
import { lightThicknessPoint, lightVisibilityPoint } from './lighting';

const visibilities = new Map<string, WgslModule>();

/**
 * Visibilidade da luz no slot `lightSlot` pelo mapa de sombra virtual no slot `shadowSlot` (a penumbra com as amostras
 * do mapa, girada no quadro, e a largura pelo disco da luz — `cones.z`, o raio angular); as outras luzes: 1.
 */
function visibilityModule(lightSlot: number, shadowSlot: number): WgslModule {
    const key = `${lightSlot}:${shadowSlot}`;
    let m = visibilities.get(key);
    if (m === undefined) {
        m = wgslModule({
            name: `light_visibility_shadow_${lightSlot}_${shadowSlot}`,
            requires: [
                shadowVirtualRead,
                lightsResource,
                shadowMapsResource,
                shadowMatricesResource,
            ],
            source: `fn light_visibility(light: u32, p: vec3f, n: vec3f) -> f32 {
    if (light != ${lightSlot}u) { return 1.0; }
    let sm = shadow_maps[${shadowSlot}u];
    let matrix = shadow_matrices[${shadowSlot}u];
    let l = -normalize(lights[${lightSlot}u].direction.xyz);
    return shadow_virtual_visibility(matrix, p, n, l, sm.bias, sm.normalBias, sm.penumbraSamples,
        lights[${lightSlot}u].cones.z);
}`,
        });
        visibilities.set(key, m);
    }
    return m;
}

const thicknesses = new Map<string, WgslModule>();

/**
 * Espessura atravessada pela luz no slot `lightSlot` pelo mapa de sombra virtual no slot `shadowSlot` (spec 011, T113);
 * as outras luzes: ninguém sabe.
 */
function thicknessModule(lightSlot: number, shadowSlot: number): WgslModule {
    const key = `${lightSlot}:${shadowSlot}`;
    let m = thicknesses.get(key);
    if (m === undefined) {
        m = wgslModule({
            name: `light_thickness_shadow_${lightSlot}_${shadowSlot}`,
            requires: [shadowVirtualThickness, lightsResource, shadowMatricesResource],
            source: `fn light_thickness(light: u32, p: vec3f, n: vec3f) -> vec2f {
    if (light != ${lightSlot}u) { return vec2f(-1.0, 0.0); }
    let l = -normalize(lights[${lightSlot}u].direction.xyz);
    return shadow_virtual_thickness(shadow_matrices[${shadowSlot}u], p, n, l);
}`,
        });
        thicknesses.set(key, m);
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
        // A espessura do corpo entre a luz e o ponto, do mesmo mapa (spec 011, T113: a subsuperfície pelas partes finas).
        {
            point: lightThicknessPoint,
            order: 0,
            pools: [Light.schema, ShadowMap.schema],
            build: (slotOf) => {
                const light = slotOf(Light.schema);
                const shadow = slotOf(ShadowMap.schema);
                return !casting() || light === undefined || shadow === undefined
                    ? undefined
                    : thicknessModule(light, shadow);
            },
        },
    ];
}
