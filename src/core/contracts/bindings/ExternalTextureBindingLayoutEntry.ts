import type { BaseBindingLayoutEntry } from './BindingLayoutEntry';

export interface ExternalTextureBindingLayoutEntry extends BaseBindingLayoutEntry {
    readonly kind: 'external-texture';
}
