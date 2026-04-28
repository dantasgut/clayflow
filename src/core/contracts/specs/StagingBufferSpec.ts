import type { BufferSpec } from './BufferSpec';

export interface StagingBufferSpec extends BufferSpec {
    readonly subkind: 'staging';
    readonly byteSize: number;
}
