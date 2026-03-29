/**
 * Struct WGSL: RBContact — slot de contato entre um corpo rígido e um collider (estático ou dinâmico).
 *
 * Layout: 80 bytes (5 × vec4f).
 *
 *   offset  0: normal      (vec4f) — xyz=normal mundo (aponta para fora do collider), w=profundidade
 *   offset 16: point       (vec4f) — xyz=ponto de contato mundo, w=lambda_n (warm-starting)
 *   offset 32: rb_idx      (u32)   — índice do corpo rígido A (ativo) em bodies[]
 *   offset 36: col_idx     (u32)   — índice do collider em colliders[]
 *   offset 40: is_active   (u32)   — 1=contato ativo, 0=slot vazio
 *   offset 44: rb_idx_b    (u32)   — índice do corpo B se o collider é dinâmico; 0xFFFFFFFF se estático
 *   offset 48: lambda_tx   (f32)   — impulso tangencial acumulado x (warm-starting)
 *   offset 52: lambda_ty   (f32)   — impulso tangencial acumulado y
 *   offset 56: diagonal_n   (f32)  — Delassus diagonal para normal — pré-computado em rb_build_lcp
 *   offset 60: diagonal_t1  (f32)  — Delassus diagonal para tangencial t1
 *   offset 64: restitution  (f32)  — coeficiente de restituição do par (combinado)
 *   offset 68: diagonal_t2  (f32)  — Delassus diagonal para tangencial t2 (t2 = cross(n, t1))
 *   offset 72: _pad3        (f32)  — padding
 *   offset 76: _pad4        (f32)  — padding
 *   Total: 80 bytes (5 × vec4f)
 *
 * Buffer: storage read_write, pré-alocado para max_contacts = body_count * collider_count slots.
 * Endereçamento determinístico: slot[rb_i * collider_count + col_j].
 * rb_narrowphase preserva lambdas do frame anterior (warm-starting) se o contato persistir.
 * rb_build_lcp pré-computa diagonal_n, diagonal_t1 e diagonal_t2 antes de rb_solve.
 *
 * Depende de: nenhum outro módulo.
 */
export const WGSL_STRUCT_RB_CONTACT = /* wgsl */`

struct RBContact {
    normal:      vec4f,  // xyz=normal mundo (aponta para fora), w=profundidade
    point:       vec4f,  // xyz=ponto de contato mundo, w=lambda_n (warm-starting)
    rb_idx:      u32,    // índice do corpo rígido A (ativo)
    col_idx:     u32,    // índice do collider
    is_active:   u32,    // 1=contato ativo, 0=slot vazio
    rb_idx_b:    u32,    // índice do corpo B se collider dinâmico; 0xFFFFFFFFu se estático
    lambda_tx:   f32,    // impulso tangencial acumulado x (warm-starting)
    lambda_ty:   f32,    // impulso tangencial acumulado y
    diagonal_n:  f32,    // Delassus diagonal para normal — pré-computado em rb_build_lcp
    diagonal_t1: f32,    // Delassus diagonal para tangencial t1
    restitution: f32,    // coeficiente de restituição do par (combinado)
    diagonal_t2: f32,    // Delassus diagonal para tangencial t2 (t2 = cross(n, t1))
    _pad3:       f32,    // padding
    _pad4:       f32,    // padding
}
`;
