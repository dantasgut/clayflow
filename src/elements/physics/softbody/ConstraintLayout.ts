/**
 * ConstraintLayout — contrato TypeScript do struct WGSL `DistanceConstraint`.
 *
 * Espelha `gpu/wgsl/structs/distance_constraint.wgsl.ts` (16 bytes, 4 × f32/u32).
 * Centraliza strides e offsets para que SoftBody.doAllocate e qualquer outro
 * módulo que precise ler/escrever constraints use nomes semânticos.
 *
 * Layout (std430, 4 × 4 bytes):
 *   offset 0: i           (u32) — índice da partícula A
 *   offset 1: j           (u32) — índice da partícula B
 *   offset 2: rest_length (f32) — comprimento de repouso (m)
 *   offset 3: compliance  (f32) — compliance da aresta (m/N); 0 = rígido
 *
 * Nota: o buffer usa view dupla (Float32Array + Uint32Array sobre o mesmo ArrayBuffer).
 * i e j devem ser escritos via Uint32Array; rest_length e compliance via Float32Array.
 */

/** Tamanho do struct em bytes (4 × 4). */
export const CONSTRAINT_STRIDE_BYTES  = 16;

/** Tamanho do struct em elementos de 4 bytes (= floats ou u32). */
export const CONSTRAINT_STRIDE_WORDS  = 4;

// ── Offsets de campo (índice word de 4 bytes dentro de um elemento) ───────────

/** Índice da partícula A — escrever via Uint32Array. */
export const C_IDX_A       = 0;

/** Índice da partícula B — escrever via Uint32Array. */
export const C_IDX_B       = 1;

/** Comprimento de repouso (f32) — escrever via Float32Array. */
export const C_REST_LENGTH = 2;

/** Compliance (f32) — escrever via Float32Array. */
export const C_COMPLIANCE  = 3;
