// FEM por XPBD (Macklin et al. 2021, spec 005 R6/US5): cinemática do tetraedro (D_s, F, J) e restrições
// hidrostática (volume) e desviadora (forma) com Δλ por compliance. Requer `linalg` e `mat`. Consumido pelo solve
// elástico do FEM (F5); validado por valores de referência no smoke `shaderLibrary`.

// ── Cinemática ───────────────────────────────────────────────────────────────

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

// ── Restrições XPBD-FEM ──────────────────────────────────────────────────────

// ── Gradientes hidrostáticos ─────────────────────────────────────────────────

// Gradiente de C_h em relação ao nó (j+1) do tetraedro.
//   F       — gradiente de deformação atual
//   J       — det(F) (pré-calculado para reutilização)
//   Bm_col  — coluna j de D_m_inv (vetor de 3 componentes)
fn grad_hydrostatic(F: mat3x3f, J: f32, Bm_col: vec3f) -> vec3f {
    // Guard against element inversion (J ≤ 0) or near-singular F.
    // mat3_inverse blows up when J ≈ 0 — return zero gradient so the
    // correction is zeroed out instead of propagating infinity/NaN.
    if (abs(J) < 0.02) { return vec3f(0.0); }
    let F_inv   = mat3_inverse(F);
    let F_inv_T = mat3_transpose(F_inv);
    let g = J * (F_inv_T * Bm_col);
    // Secondary safety: cap gradient magnitude to prevent stray blow-ups.
    let len_sq = dot(g, g);
    if (len_sq > 1e10) { return vec3f(0.0); }
    return g;
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
    let dl = -(C + alpha_tilde * lambda) / denom;
    // Clamp to prevent warm-start runaway on the first inverted frames.
    return clamp(dl, -1e4, 1e4);
}

// ── Nó 0 por equilíbrio ──────────────────────────────────────────────────────

// g0 = -(g1 + g2 + g3)  (partição da unidade: Σ g_i = 0)
fn grad_node0(g1: vec3f, g2: vec3f, g3: vec3f) -> vec3f {
    return -(g1 + g2 + g3);
}
