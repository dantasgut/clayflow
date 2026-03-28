/**
 * RBContactLayout — contrato TypeScript do struct WGSL `RBContact`.
 *
 * Espelha `gpu/wgsl/structs/rb_contact.wgsl.ts` (80 bytes, 5 × vec4f).
 * Centraliza strides e offsets para que qualquer módulo que leia ou aloque
 * o buffer de contatos use nomes semânticos em vez de magic numbers.
 *
 * Layout:
 *   offset  0: normal      (vec4f) — xyz=normal mundo, w=profundidade
 *   offset  4: point       (vec4f) — xyz=ponto de contato, w=lambda_n
 *   offset  8: rb_idx      (u32)
 *   offset  9: col_idx     (u32)
 *   offset 10: is_active   (u32)
 *   offset 11: rb_idx_b    (u32)  — índice do corpo B se collider dinâmico; 0xFFFFFFFF se estático
 *   offset 12: lambda_tx   (f32)
 *   offset 13: lambda_ty   (f32)
 *   offset 14: diagonal_n  (f32)
 *   offset 15: diagonal_t1  (f32)
 *   offset 16: restitution  (f32)
 *   offset 17: diagonal_t2  (f32)
 *   offset 18: _pad3       (f32)
 *   offset 19: _pad4       (f32)
 */

/** Tamanho do struct em bytes (5 × vec4f). */
export const RB_CONTACT_STRIDE_BYTES  = 80;

/** Tamanho do struct em f32 (80 / 4). */
export const RB_CONTACT_STRIDE_FLOATS = 20;
