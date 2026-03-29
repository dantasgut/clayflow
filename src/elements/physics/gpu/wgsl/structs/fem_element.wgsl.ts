/**
 * Struct WGSL: FEMElement — dados estáticos + estado de um tetraedro T4.
 *
 * Layout: 112 bytes (7 × vec4f, alinhamento std430 correto para storage buffer).
 *
 *   offset  0: node_indices (vec4u)          — índices dos 4 nós: n0,n1,n2,n3
 *   offset 16: Bm_col0     (vec4f)           — coluna 0 de D_m_inv + rest_volume.w
 *   offset 32: Bm_col1     (vec4f)           — coluna 1 de D_m_inv + mu.w (cópia local)
 *   offset 48: Bm_col2     (vec4f)           — coluna 2 de D_m_inv + lambda.w (cópia local)
 *   offset 64: lambdas     (vec4f)           — λ_h.x, λ_d.y, padding.zw
 *   offset 80: _pad0       (vec4f)           — reservado
 *   offset 96: _pad1       (vec4f)           — reservado
 *   Total: 112 bytes
 *
 * D_m_inv (D_m⁻¹ = inversa da shape matrix de repouso) é pré-computada na CPU
 * e armazenada por colunas nos campos Bm_col{0,1,2}.xyz.
 *
 * Convenção:
 *   D_m = [p1_rest - p0_rest | p2_rest - p0_rest | p3_rest - p0_rest]
 *   Bm_col_j = j-ésima coluna de D_m_inv
 *   rest_volume = (1/6) * |det(D_m)|
 */
export const WGSL_STRUCT_FEM_ELEMENT = /* wgsl */`

struct FEMElement {
    node_indices: vec4u,   // n0, n1, n2, n3 (índices no buffer de nós)
    Bm_col0:      vec4f,   // D_m_inv coluna 0 (xyz) + rest_volume (w)
    Bm_col1:      vec4f,   // D_m_inv coluna 1 (xyz) + cópia local mu (w)
    Bm_col2:      vec4f,   // D_m_inv coluna 2 (xyz) + cópia local lambda (w)
    lambdas:      vec4f,   // x=lambda_h, y=lambda_d, z=padding, w=padding
    _pad0:        vec4f,
    _pad1:        vec4f,
}
`;
