/**
 * ParticleLayout — contrato TypeScript do struct WGSL `Particle`.
 *
 * Espelha `gpu/wgsl/structs/particle.wgsl.ts` (48 bytes, 3 × vec4f).
 * Centraliza strides e offsets para que SoftBody.doAllocate e qualquer
 * outro módulo que precise ler/escrever partículas use nomes semânticos.
 *
 * Layout:
 *   offset  0: pos  (vec4f) — xyz=posição atual,    w=invMass
 *   offset  4: pred (vec4f) — xyz=posição prevista, w=reservado
 *   offset  8: vel  (vec4f) — xyz=velocidade,       w=reservado
 */

/** Tamanho do struct em bytes (3 × vec4f). */
export const PARTICLE_STRIDE_BYTES  = 48;

/** Tamanho do struct em f32 (48 / 4). */
export const PARTICLE_STRIDE_FLOATS = 12;

// ── Offsets de campo (índice f32 dentro de um elemento) ───────────────────────

export const P_POS_X    = 0;
export const P_POS_Y    = 1;
export const P_POS_Z    = 2;
export const P_INV_MASS = 3;

export const P_PRED_X   = 4;
export const P_PRED_Y   = 5;
export const P_PRED_Z   = 6;
// [7] reservado

export const P_VEL_X    = 8;
export const P_VEL_Y    = 9;
export const P_VEL_Z    = 10;
// [11] reservado
