import type { BaseBindingLayoutEntry } from './BaseBindingLayoutEntry';

export interface BufferBindingLayoutEntry extends BaseBindingLayoutEntry {
    readonly kind: 'buffer';
    readonly type?: 'uniform' | 'storage' | 'read-only-storage';
    readonly hasDynamicOffset?: boolean;
    readonly minBindingSize?: number;
}
