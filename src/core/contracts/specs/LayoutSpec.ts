import type { BindingLayoutEntry } from '../bindings/BindingLayoutEntry';

/**
 * Spec de bindgroup layout GPU — define a "forma" de um bindgroup:
 * que tipos de bindings existem em quais slots, com que visibility.
 * Materializado em GPUBindGroupLayout.
 *
 * Pipelines referenciam layouts (não bindgroups) para validação em
 * compile time. Bindgroups concretos podem variar por instância mas
 * todos compatíveis com o mesmo layout.
 */
export interface LayoutSpec {
    /** Discriminador de tipo — sempre `'layout'`. */
    readonly kind: 'layout';
    /** Discriminador semântico (e.g. 'forward_camera_layout'). Parte do specHash. */
    readonly discriminator?: string;
    /** Label para debugging. */
    readonly label?: string;
    /** Entries que descrevem cada binding (slot + visibility + type-specific). */
    readonly entries: readonly BindingLayoutEntry[];
}
