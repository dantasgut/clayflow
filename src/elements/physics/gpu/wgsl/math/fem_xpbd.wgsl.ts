/**
 * Módulo WGSL: núcleo XPBD-FEM — gradientes e Δλ para restrições de tetraedro.
 *
 * Implementa duas restrições por elemento (Macklin et al. 2021):
 *
 *   C_h (hidrostática): C_h = det(F) - 1     → preserva volume
 *   C_d (desviadora):   C_d = ||F||_F - √3   → preserva forma
 *
 * Gradientes para os nós 1,2,3 (nó 0 por equilíbrio: g0 = -(g1+g2+g3)):
 *
 *   Hidrostático:  gh_j = J × (F_inv_T × Bm_col_j)
 *   Desviador:     gd_j = (F × Bm_col_j) / ||F||_F
 *
 * onde Bm_col_j = coluna j de D_m_inv (armazenada em FEMElement.Bm_col{0,1,2}.xyz).
 *
 * Δλ XPBD:  Δλ = -(C + (α/dt²)·λ) / (Σ w_i·|g_i|² + α/dt²)
 *
 * Referência: Müller 2007 + Macklin & Müller 2021 "XPBD: Position-Based Simulation
 * of Compliant Constrained Dynamics".
 *
 * Depende de: linalg.wgsl (mat3_inverse, mat3_transpose, mat3_frobenius_norm, mat3_mul).
 */
export const WGSL_FEM_XPBD = /* wgsl */`

// ── Gradientes hidrostáticos ─────────────────────────────────────────────────

// Gradiente de C_h em relação ao nó (j+1) do tetraedro.
//   F       — gradiente de deformação atual
//   J       — det(F) (pré-calculado para reutilização)
//   Bm_col  — coluna j de D_m_inv (vetor de 3 componentes)
fn grad_hydrostatic(F: mat3x3f, J: f32, Bm_col: vec3f) -> vec3f {
    let F_inv   = mat3_inverse(F);
    let F_inv_T = mat3_transpose(F_inv);
    return J * (F_inv_T * Bm_col);
}

// ── Gradientes desviadores ────────────────────────────────────────────────────

// Gradiente de C_d em relação ao nó (j+1) do tetraedro.
//   F       — gradiente de deformação atual
//   F_norm  — ||F||_F (pré-calculado para reutilização)
//   Bm_col  — coluna j de D_m_inv
fn grad_deviatoric(F: mat3x3f, F_norm: f32, Bm_col: vec3f) -> vec3f {
    if (F_norm < 1e-12) { return vec3f(0.0); }
    return (F * Bm_col) / F_norm;
}

// ── Δλ XPBD ──────────────────────────────────────────────────────────────────

// Calcula o incremento Δλ de um multiplicador de Lagrange XPBD.
//   C          — violação da restrição
//   w_sum      — soma das massas generalizadas (w0·|g0|² + ... + w3·|g3|²)
//   alpha_tilde — compliance normalizado α / dt²
//   lambda     — multiplicador acumulado do passo anterior (warm start)
fn fem_delta_lambda(C: f32, w_sum: f32, alpha_tilde: f32, lambda: f32) -> f32 {
    let denom = w_sum + alpha_tilde;
    if (denom < 1e-12) { return 0.0; }
    return -(C + alpha_tilde * lambda) / denom;
}

// ── Nó 0 por equilíbrio ──────────────────────────────────────────────────────

// g0 = -(g1 + g2 + g3)  (partição da unidade: Σ g_i = 0)
fn grad_node0(g1: vec3f, g2: vec3f, g3: vec3f) -> vec3f {
    return -(g1 + g2 + g3);
}
`;
