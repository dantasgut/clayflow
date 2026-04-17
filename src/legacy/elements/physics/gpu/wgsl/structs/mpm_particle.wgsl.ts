/**
 * Struct WGSL: MPMParticle — estado completo de uma partícula MPM (MLS-MPM/APIC).
 *
 * Layout: 128 bytes (8 × vec4f, alinhamento std430).
 *
 *   offset   0: pos   (vec4f) — xyz=posição world, w=massa
 *   offset  16: vel   (vec4f) — xyz=velocidade,   w=volume de repouso V0
 *   offset  32: F_col0(vec4f) — col0 de F (gradiente de deformação), w=det(F) cache
 *   offset  48: F_col1(vec4f) — col1 de F, w=material_id local (override de MPMSimParams)
 *   offset  64: F_col2(vec4f) — col2 de F, w=padding
 *   offset  80: C_col0(vec4f) — col0 da matriz afim APIC C, w=padding
 *   offset  96: C_col1(vec4f) — col1 da matriz afim C, w=padding
 *   offset 112: C_col2(vec4f) — col2 da matriz afim C, w=padding
 *   Total: 128 bytes
 *
 * F (gradiente de deformação): inicializado como identidade I₃.
 * C (campo afim APIC):         inicializado como zeros 0₃ₓ₃.
 * V0 (volume de repouso):      V0 = cell_size³ × total_cells / particle_count.
 *
 * Na formulação MLS-MPM, C_p é ao mesmo tempo o campo afim de transferência
 * (como no APIC) e o gradiente de velocidade ∇v_p: C_p = D^{-1} × B_p,
 * onde B_p = Σ_i w_ip × v_i ⊗ (x_i - x_p) e D^{-1} = 4/dx² (B-spline quadrático).
 *
 * A atualização de F usa diretamente C_p: F_new = (I + dt × C_p) × F_old.
 */
export const WGSL_STRUCT_MPM_PARTICLE = /* wgsl */`

struct MPMParticle {
    pos:    vec4f,  // xyz = posição world, w = massa
    vel:    vec4f,  // xyz = velocidade,   w = volume de repouso V0_p
    F_col0: vec4f,  // coluna 0 de F (3×3), w = det(F) cacheado
    F_col1: vec4f,  // coluna 1 de F,       w = material_id override
    F_col2: vec4f,  // coluna 2 de F,       w = padding
    C_col0: vec4f,  // coluna 0 de C (APIC affine momentum matrix)
    C_col1: vec4f,  // coluna 1 de C
    C_col2: vec4f,  // coluna 2 de C
}
`;
