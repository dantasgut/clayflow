import type { BufferSpec } from './BufferSpec';

export interface StorageBufferSpec extends BufferSpec {
    readonly subkind: 'storage';
    readonly byteSize: number;
}
