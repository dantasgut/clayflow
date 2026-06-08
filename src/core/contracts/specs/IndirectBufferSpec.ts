import type { BufferSpec } from './BufferSpec';

/**
 * Spec de indirect buffer — armazena draw/dispatch parameters lidos pela
 * GPU em runtime (vs. valores constantes hardcoded em JS). Permite
 * GPU-driven rendering: compute shader popula o buffer e o draw
 * call lê dele.
 *
 * Layouts típicos:
 *   - Indexed indirect draw: 5 u32 (indexCount, instanceCount, firstIndex,
 *     baseVertex, firstInstance).
 *   - Compute dispatch indirect: 3 u32 (groupCountX, Y, Z).
 *
 * Usado por `pass.draw.indexedIndirect(spec, offset)` e
 * `pass.dispatch.indirect(spec, offset)`.
 */
export interface IndirectBufferSpec extends BufferSpec {
    readonly subkind: 'indirect';
    /** Tamanho em bytes (múltiplos de draw/dispatch struct size). */
    readonly byteSize: number;
}
