import type { BufferSpec } from './BufferSpec';

/**
 * Spec de uniform buffer (UBO em WGSL). Read-only em todos os stages
 * (`var<uniform>`). Tipicamente pequeno (até 16 KiB por device limit
 * em alguns GPUs) e usado para parâmetros que não mudam durante o frame
 * (camera, material, sim params).
 *
 * Para datasets maiores ou writable, use `StorageBufferSpec`.
 */
export interface UniformBufferSpec extends BufferSpec {
    /** Subdiscriminador concreto — sempre `'uniform'`. */
    readonly subkind: 'uniform';
    /** Tamanho em bytes. Alinhe com schema.stride para layouts WGSL corretos. */
    readonly byteSize: number;
}
