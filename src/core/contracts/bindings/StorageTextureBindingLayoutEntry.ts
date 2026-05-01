import type { BaseBindingLayoutEntry } from './BaseBindingLayoutEntry';

export interface StorageTextureBindingLayoutEntry extends BaseBindingLayoutEntry {
    readonly kind: 'storage-texture';
    readonly access?: 'write-only' | 'read-only' | 'read-write';
    readonly format: GPUTextureFormat;
    readonly viewDimension?: GPUTextureViewDimension;
}
