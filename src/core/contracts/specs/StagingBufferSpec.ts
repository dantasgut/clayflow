import type { BufferSpec } from './BufferSpec';

/**
 * Spec de staging buffer (`COPY_DST | MAP_READ`) — usado para readback
 * GPU → CPU. Pipeline típico: compute escreve em StorageBuffer →
 * `frame.copy(storage, staging, size)` → `await core.readback(staging)`
 * → ArrayBuffer no CPU.
 *
 * Não é usado dentro de shaders (não tem `read` access em WGSL).
 */
export interface StagingBufferSpec extends BufferSpec {
    readonly subkind: 'staging';
    /** Tamanho em bytes do buffer (deve acomodar os dados a serem readback). */
    readonly byteSize: number;
}
