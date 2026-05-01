import type { BaseBindingLayoutEntry } from './BaseBindingLayoutEntry';

export interface TextureBindingLayoutEntry extends BaseBindingLayoutEntry {
    readonly kind: 'texture';
    readonly sampleType?: 'float' | 'unfilterable-float' | 'depth' | 'sint' | 'uint';
    readonly viewDimension?: GPUTextureViewDimension;
    readonly multisampled?: boolean;
}
