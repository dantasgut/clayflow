/**
 * Módulo WGSL: cinemática FEM — gradiente de deformação F e quantidades derivadas.
 *
 * Implementa:
 *   - compute_Ds: shape matrix atual D_s a partir de 4 nós do tetraedro
 *   - compute_F:  gradiente de deformação F = D_s × D_m_inv
 *   - compute_J:  volume ratio J = det(F)
 *
 * Convenção: tetraedro T4 — nós (p0, p1, p2, p3).
 *   D_s = [p1-p0 | p2-p0 | p3-p0]   (shape matrix do estado atual)
 *   D_m_inv armazenado por coluna em FEMElement.Bm_col{0,1,2}.xyz
 *
 * Referência: Müller & Gross 2004, "Interactive Virtual Materials".
 *
 * Depende de: linalg.wgsl (mat3_mul, mat3_det, mat3_from_cols).
 */
export const WGSL_FEM_KINEMATICS = /* wgsl */`

// Constrói a shape matrix atual D_s a partir de 4 posições de nós.
// D_s = [p1-p0 | p2-p0 | p3-p0]  (column-major, WGSL mat3x3f)
fn compute_Ds(p0: vec3f, p1: vec3f, p2: vec3f, p3: vec3f) -> mat3x3f {
    return mat3_from_cols(p1 - p0, p2 - p0, p3 - p0);
}

// Gradiente de deformação F = D_s × D_m_inv.
// D_m_inv é passada pré-computada (lida de FEMElement.Bm_col*).
fn compute_F(Ds: mat3x3f, Dm_inv: mat3x3f) -> mat3x3f {
    return mat3_mul(Ds, Dm_inv);
}

// Volume ratio (Jacobiano): J = det(F).
// J == 1 → sem mudança de volume; J < 0 → inversão (instabilidade numérica).
fn compute_J(F: mat3x3f) -> f32 {
    return mat3_det(F);
}
`;
