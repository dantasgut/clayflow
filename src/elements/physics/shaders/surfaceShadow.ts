import { wgslModule, type WgslModule } from '../../../scene/shaders/WgslModule';
import { wgslResource } from '../../../scene/shaders/WgslResource';
import surfaceShadowSource from '../../gpu/wgsl/math/surface_shadow.wgsl?raw';
import { lightsResource } from '../../scene/resources';

/** Pool do campo dos colisores de superfície (`SurfaceCollider.cellSchema`). */
export const SURFACE_COLLIDER_CELL_POOL = 'SurfaceColliderCell';

/** O campo dos colisores de superfície (o pool), em leitura: a sombra pelo campo de alturas. */
export const surfaceShadowFieldResource = wgslResource({
    name: 'surface_shadow_field',
    binding: { storage: 'read' },
    type: { wgsl: 'f32', array: true },
    frequency: 'stage',
    provider: { pool: SURFACE_COLLIDER_CELL_POOL },
});

/** A visibilidade do disco de uma luz pelo campo de alturas e a pirâmide de máximos (`surface_shadow.wgsl`). */
export const surfaceShadow = wgslModule({
    name: 'surface_shadow',
    source: surfaceShadowSource,
    requires: [surfaceShadowFieldResource],
});

const transmissions = new Map<number, WgslModule>();

/**
 * Contribuição ao ponto `light_transmission` da superfície cujo campo começa no slot `first` do pool: a visibilidade do
 * disco das luzes direcionais que projetam sombra (`kind` 0, `castShadow`; o raio angular em `cones.z`); as outras
 * luzes e a ambiente passam inteiras.
 */
export function surfaceShadowTransmission(first: number): WgslModule {
    let m = transmissions.get(first);
    if (m === undefined) {
        m = wgslModule({
            name: `light_transmission_surface_shadow_${first}`,
            requires: [surfaceShadow, lightsResource],
            source: `fn light_transmission(light: u32, p: vec3f) -> vec3f {
    if (light >= arrayLength(&lights)) { return vec3f(1.0); }
    let li = lights[light];
    if (li.kind != 0u || li.castShadow == 0u) { return vec3f(1.0); }
    return vec3f(surface_shadow_visibility(${first}u, p, -normalize(li.direction.xyz), li.cones.z));
}`,
        });
        transmissions.set(first, m);
    }
    return m;
}
