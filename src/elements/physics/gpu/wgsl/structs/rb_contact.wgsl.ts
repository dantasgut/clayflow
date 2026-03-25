/**
 * Struct WGSL: RBContact — slot de contato entre um corpo rígido e um collider estático.
 *
 * Layout: 64 bytes (4 × vec4f).
 *
 *   offset  0: normal     (vec4f) — xyz=normal mundo (aponta para fora), w=profundidade
 *   offset 16: point      (vec4f) — xyz=ponto de contato mundo, w=lambda_n (warm-starting)
 *   offset 32: rb_idx     (u32)   — índice do corpo rígido em bodies[]
 *   offset 36: col_idx    (u32)   — índice do collider em colliders[]
 *   offset 40: is_active  (u32)   — 1=contato ativo, 0=slot vazio
 *   offset 44: feature_id (u32)   — índice de feature (0-3 para multi-ponto)
 *   offset 48: lambda_tx  (f32)   — impulso tangencial acumulado x (warm-starting)
 *   offset 52: lambda_ty  (f32)   — impulso tangencial acumulado y
 *   offset 56: _pad0      (f32)   — padding
 *   offset 60: _pad1      (f32)   — padding
 *   Total: 64 bytes
 *
 * Buffer: storage read_write, pré-alocado para max_contacts = body_count * collider_count slots.
 * Endereçamento determinístico: slot[rb_i * collider_count + col_j].
 * rb_narrowphase preserva lambdas do frame anterior (warm-starting) se o contato persistir.
 *
 * Depende de: nenhum outro módulo.
 */
export const WGSL_STRUCT_RB_CONTACT = /* wgsl */`

struct RBContact {
    normal:     vec4f,  // xyz=normal mundo (aponta para fora), w=profundidade
    point:      vec4f,  // xyz=ponto de contato mundo, w=lambda_n (warm-starting)
    rb_idx:     u32,    // índice do corpo rígido
    col_idx:    u32,    // índice do collider
    is_active:  u32,    // 1=contato ativo, 0=slot vazio
    feature_id: u32,    // índice de feature (0-3 para multi-ponto)
    lambda_tx:  f32,    // impulso tangencial acumulado x (warm-starting)
    lambda_ty:  f32,    // impulso tangencial acumulado y
    _pad0:      f32,
    _pad1:      f32,
}
`;
