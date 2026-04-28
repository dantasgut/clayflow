// portado de legacy/elements/physics/gpu/wgsl/structs/rb_contact.wgsl.ts
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
