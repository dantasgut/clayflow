// portado de legacy/elements/physics/gpu/wgsl/structs/fem_element.wgsl.ts
struct FEMElement {
    node_indices: vec4u,   // n0, n1, n2, n3 (índices no buffer de nós)
    Bm_col0:      vec4f,   // D_m_inv coluna 0 (xyz) + rest_volume (w)
    Bm_col1:      vec4f,   // D_m_inv coluna 1 (xyz) + cópia local mu (w)
    Bm_col2:      vec4f,   // D_m_inv coluna 2 (xyz) + cópia local lambda (w)
    lambdas:      vec4f,   // x=lambda_h, y=lambda_d, z=padding, w=padding
    _pad0:        vec4f,
    _pad1:        vec4f,
}
