import type { BindingLayoutEntry } from '../bindings/BindingLayoutEntry';

export interface LayoutSpec {
    readonly kind: 'layout';
    readonly discriminator?: string;
    readonly label?: string;
    readonly entries: readonly BindingLayoutEntry[];
}
