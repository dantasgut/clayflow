import type { BufferSpec } from './BufferSpec';

export interface IndexBufferSpec extends BufferSpec {
    readonly subkind: 'index';
    readonly byteSize: number;
    readonly count: number;
    readonly format: GPUIndexFormat;
}
