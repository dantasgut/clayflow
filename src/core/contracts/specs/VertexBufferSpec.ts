import type { BufferSpec } from './BufferSpec';

export interface VertexBufferSpec extends BufferSpec {
    readonly subkind: 'vertex';
    readonly byteSize: number;
    readonly stride: number;
    readonly count: number;
}
