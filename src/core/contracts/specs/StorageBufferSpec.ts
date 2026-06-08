import type { BufferSpec } from './BufferSpec';

/**
 * Spec de storage buffer (SSBO em WGSL). Read-write em compute shaders
 * (`var<storage, read_write>`) ou read-only em vertex/fragment
 * (`var<storage, read>`). Tamanho arbitrário (até device limit).
 *
 * Usado em pools (RigidBodies, particles), constraint lists, neighbor
 * search results, etc.
 */
export interface StorageBufferSpec extends BufferSpec {
    /** Subdiscriminador concreto — sempre `'storage'`. */
    readonly subkind: 'storage';
    /** Tamanho em bytes. Deve acomodar todos os elementos com align WGSL. */
    readonly byteSize: number;
}
