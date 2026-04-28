// portado de legacy/elements/physics/gpu/wgsl/math/fem_kinematics.wgsl.ts
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
