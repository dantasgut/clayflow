import type { BufferSpec } from './BufferSpec';

export interface IndirectBufferSpec extends BufferSpec {
    readonly subkind: 'indirect';
    readonly byteSize: number;
}
