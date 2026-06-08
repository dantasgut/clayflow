import type { BufferSpec } from './BufferSpec';

/**
 * Spec de vertex buffer (VBO). Bound via `pass.geometry.vertex(slot, spec)`
 * em render passes; cada slot tem seu próprio layout (positions, normals,
 * uvs separados ou interleaved).
 */
export interface VertexBufferSpec extends BufferSpec {
    /** Subdiscriminador concreto — sempre `'vertex'`. */
    readonly subkind: 'vertex';
    /** Tamanho total do buffer em bytes (= count × stride). */
    readonly byteSize: number;
    /** Bytes por vertex (stride). E.g. 32 para position+normal+uv interleaved. */
    readonly stride: number;
    /** Número de vértices no buffer. */
    readonly count: number;
}
