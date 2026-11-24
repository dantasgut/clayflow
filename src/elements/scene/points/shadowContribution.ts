import { wgslModule, type WgslModule } from '../../../scene/shaders/WgslModule';
import type { SceneContribution } from '../../../scene/shaders/WgslPoint';
import { shadowVirtualRead, shadowVirtualThickness } from './shaders';
import { Light } from '../Light';
import { ShadowMap } from '../ShadowMap';
import { lightsResource, shadowMapsResource, shadowMatricesResource } from '../resources';
import { lightThicknessPoint, lightVisibilityPoint } from './lighting';

/** O tipo da luz que projeta (o `kind` do pool `Light`): direcional, pontual ou de foco. */
export type ShadowCasterKind = 'directional' | 'point' | 'spot';

const visibilities = new Map<string, WgslModule>();

/** A leitura da sombra de cada tipo de luz (a direção do ponto à luz `l`, o mapa `sm` e o referencial do slot). */
const VISIBILITY: Readonly<
    Record<ShadowCasterKind, (lightSlot: number, shadowSlot: number) => string>
> = {
    // O plano da luz, com a penumbra pelo disco dela (`cones.z`, o raio angular).
    directional: (lightSlot, shadowSlot) => `    let matrix = shadow_matrices[${shadowSlot}u];
    let l = -normalize(lights[${lightSlot}u].direction.xyz);
    return shadow_virtual_visibility(matrix, p, n, l, sm.bias, sm.normalBias, sm.penumbraSamples,
        lights[${lightSlot}u].cones.z);`,
    // A vista em perspectiva do cone externo, com a penumbra pelo raio da fonte (`cones.w`, m).
    spot: (lightSlot, shadowSlot) => `    let matrix = shadow_matrices[${shadowSlot}u];
    let l = normalize(lights[${lightSlot}u].position.xyz - p);
    return shadow_virtual_visibility(matrix, p, n, l, sm.bias, sm.normalBias, sm.penumbraSamples,
        lights[${lightSlot}u].cones.w);`,
    // As seis faces do cubo: a face pela direção da luz ao ponto.
    point: (lightSlot, shadowSlot) => `    let matrix = shadow_matrices[${shadowSlot}u];
    let l = normalize(lights[${lightSlot}u].position.xyz - p);
    return shadow_cube_visibility(matrix, p, n, l, sm.bias, sm.normalBias, sm.penumbraSamples,
        lights[${lightSlot}u].cones.w);`,
};

/**
 * Visibilidade da luz no slot `lightSlot` pelo mapa de sombra virtual no slot `shadowSlot` (a penumbra com as amostras
 * do mapa, girada no quadro, e a largura pelo tamanho da fonte — `cones.z`, o raio angular do disco da direcional; `cones.w`, o raio
 * em metros da luz local); as outras luzes: 1.
 */
function visibilityModule(
    kind: ShadowCasterKind,
    lightSlot: number,
    shadowSlot: number,
): WgslModule {
    const key = `${kind}:${lightSlot}:${shadowSlot}`;
    let m = visibilities.get(key);
    if (m === undefined) {
        m = wgslModule({
            // O nome da direcional é o de antes da spec 013 (o mesmo shader composto).
            name:
                kind === 'directional'
                    ? `light_visibility_shadow_${lightSlot}_${shadowSlot}`
                    : `light_visibility_shadow_${kind}_${lightSlot}_${shadowSlot}`,
            requires: [
                shadowVirtualRead,
                lightsResource,
                shadowMapsResource,
                shadowMatricesResource,
            ],
            source: `fn light_visibility(light: u32, p: vec3f, n: vec3f) -> f32 {
    if (light != ${lightSlot}u) { return 1.0; }
    let sm = shadow_maps[${shadowSlot}u];
${VISIBILITY[kind](lightSlot, shadowSlot)}
}`,
        });
        visibilities.set(key, m);
    }
    return m;
}

const thicknesses = new Map<string, WgslModule>();

/** A leitura da espessura de cada tipo de luz. */
const THICKNESS: Readonly<
    Record<ShadowCasterKind, (lightSlot: number, shadowSlot: number) => string>
> = {
    directional: (
        lightSlot,
        shadowSlot,
    ) => `    let l = -normalize(lights[${lightSlot}u].direction.xyz);
    return shadow_virtual_thickness(shadow_matrices[${shadowSlot}u], p, n, l);`,
    spot: (lightSlot, shadowSlot) => `    let l = normalize(lights[${lightSlot}u].position.xyz - p);
    return shadow_virtual_thickness(shadow_matrices[${shadowSlot}u], p, n, l);`,
    point: (
        lightSlot,
        shadowSlot,
    ) => `    let l = normalize(lights[${lightSlot}u].position.xyz - p);
    return shadow_cube_thickness(shadow_matrices[${shadowSlot}u], p, n, l);`,
};

/**
 * Espessura atravessada pela luz no slot `lightSlot` pelo mapa de sombra virtual no slot `shadowSlot` (spec 011, T113);
 * as outras luzes: ninguém sabe.
 */
function thicknessModule(
    kind: ShadowCasterKind,
    lightSlot: number,
    shadowSlot: number,
): WgslModule {
    const key = `${kind}:${lightSlot}:${shadowSlot}`;
    let m = thicknesses.get(key);
    if (m === undefined) {
        m = wgslModule({
            name:
                kind === 'directional'
                    ? `light_thickness_shadow_${lightSlot}_${shadowSlot}`
                    : `light_thickness_shadow_${kind}_${lightSlot}_${shadowSlot}`,
            requires: [shadowVirtualThickness, lightsResource, shadowMatricesResource],
            source: `fn light_thickness(light: u32, p: vec3f, n: vec3f) -> vec2f {
    if (light != ${lightSlot}u) { return vec2f(-1.0, 0.0); }
${THICKNESS[kind](lightSlot, shadowSlot)}
}`,
        });
        thicknesses.set(key, m);
    }
    return m;
}

/**
 * Contribuição da luz que projeta sombra (spec 031, R4; spec 011, R7; spec 013: direcional, de foco e pontual) ao ponto
 * `light_visibility`: a sombra do seu mapa vale só para ela (pelo slot no pool `Light`); as outras luzes passam
 * inteiras. Sem projetar (`castShadow` 0), sem vista no atlas ou sem slot ainda, não contribui.
 */
export function shadowCasterContributions(
    casting: () => boolean,
    kind: ShadowCasterKind = 'directional',
): readonly SceneContribution[] {
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
                    : visibilityModule(kind, light, shadow);
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
                    : thicknessModule(kind, light, shadow);
            },
        },
    ];
}
