import type { BindingEntry } from '../bindings/BindingEntry';
import type { LayoutSpec } from './LayoutSpec';

export interface BindGroupSpec {
    readonly kind: 'bindgroup';
    readonly discriminator?: string;
    readonly label?: string;
    readonly layout: LayoutSpec;
    readonly bindings: readonly BindingEntry[];
}
