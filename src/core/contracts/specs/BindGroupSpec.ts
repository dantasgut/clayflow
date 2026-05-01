import type { BindingEntry } from '../bindings/BindingEntry';
import type { LayoutSpec } from './LayoutSpec';

/**
 * Spec de bindgroup GPU — agrupa N bindings (buffers, texturas, samplers)
 * referenciáveis em um único `@group(N)` no shader. Materializado por
 * `core.create<BindGroupSpec>()` em GPUBindGroup.
 *
 * O `layout` define o tipo/visibility de cada binding; `bindings` aponta
 * para os specs concretos (UniformBufferSpec, TextureViewSpec, etc.).
 */
export interface BindGroupSpec {
    readonly kind: 'bindgroup';
    /** Discriminador semântico (e.g. 'forward_camera_bg:42'). Parte do specHash. */
    readonly discriminator?: string;
    /** Label para debugging. */
    readonly label?: string;
    /** Layout que define visibility + types das bindings. */
    readonly layout: LayoutSpec;
    /** Bindings concretas (buffer/texture-view/sampler). Indices match layout entries. */
    readonly bindings: readonly BindingEntry[];
}
