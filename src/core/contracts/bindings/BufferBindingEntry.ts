import type { AnyBufferSpec } from '../specs/ResourceSpec';

export interface BufferBindingEntry {
    readonly binding: number;
    readonly kind: 'buffer';
    readonly buffer: AnyBufferSpec;
    readonly offset?: number;
    readonly size?: number;
}
