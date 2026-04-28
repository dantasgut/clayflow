import type { BufferSpec } from './BufferSpec';

export interface UniformBufferSpec extends BufferSpec {
    readonly subkind: 'uniform';
    readonly byteSize: number;
}
