import type { BufferSpec } from './BufferSpec';

/**
 * Spec de index buffer (IBO). Bound via `pass.geometry.index(spec)` em
 * render passes; usado por `pass.draw.indexed(count)`.
 *
 * `format` controla o tipo de cada index ('uint16' = 2 bytes, 'uint32' = 4 bytes).
 * Use uint32 quando vertex count > 65535, senão uint16 economiza memória.
 */
export interface IndexBufferSpec extends BufferSpec {
    readonly subkind: 'index';
    /** Tamanho total do buffer em bytes (= count × bytesPerIndex). */
    readonly byteSize: number;
    /** Número de índices no buffer (count = índice de triângulos × 3 para topology=triangle-list). */
    readonly count: number;
    /** Formato dos índices: 'uint16' (até 65535 verts) ou 'uint32'. */
    readonly format: GPUIndexFormat;
}
