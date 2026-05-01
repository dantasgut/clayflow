import type { BaseBindingLayoutEntry } from './BaseBindingLayoutEntry';

export interface ExternalTextureBindingLayoutEntry extends BaseBindingLayoutEntry {
    readonly kind: 'external-texture';
}
