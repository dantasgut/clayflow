import type { AnyBufferSpec } from '../specs/AnyBufferSpec';

export interface BufferBindingEntry {
    readonly binding: number;
    readonly kind: 'buffer';
    readonly buffer: AnyBufferSpec;
    readonly offset?: number;
    readonly size?: number;
}
