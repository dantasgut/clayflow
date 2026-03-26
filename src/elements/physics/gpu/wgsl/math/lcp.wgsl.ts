/**
 * Módulo WGSL: núcleo matemático LCP/PGS para resolução de contatos.
 *
 * Implementa as funções do solver LCP (Linear Complementarity Problem) via
 * Projected Gauss-Seidel (PGS), cobrindo:
 *   - Diagonal de Delassus (massa generalizada de dois corpos)
 *   - Bias de constraint com Baumgarte + restituição
 *   - Passo PGS unilateral (projeção Signorini para normal de contato)
 *   - Passo PGS com cone de Coulomb isotrópico (fricção tangencial 2D)
 *
 * Referências:
 *   - Erin Catto, "Iterative Dynamics with Temporal Coherence", GDC 2005
 *   - Dirk Gregorius, "Robust Contact Creation for Physics Simulations", GDC 2013
 *
 * Depende de: RigidBody (struct), RBSimParams (struct),
 *             xpbd.wgsl (rigid_generalized_mass).
 */
export const WGSL_LCP = /* wgsl */`

// ── Núcleo LCP/PGS ────────────────────────────────────────────────────────────

/// Elemento diagonal da matriz de Delassus para constraint normal entre dois corpos.
/// Soma as contribuições de massa generalizada de cada corpo.
/// rb_i: corpo i (com inv_mass em pos.w e I_inv em I_inv.xyz)
/// rb_j: corpo j
/// ra: vetor CM_i → contato (world frame)
/// rb_vec: vetor CM_j → contato (world frame)
/// n:  normal de contato (world frame)
fn delassus_diagonal(rb_i: RigidBody, rb_j: RigidBody, ra: vec3f, rb_vec: vec3f, n: vec3f) -> f32 {
    return rigid_generalized_mass(ra, n, rb_i.pos.w, rb_i.I_inv.xyz)
         + rigid_generalized_mass(rb_vec, n, rb_j.pos.w, rb_j.I_inv.xyz);
}

/// Bias escalar b_k do constraint LCP.
/// gap: profundidade de penetração (< 0 = penetração, pois depth_eff = -depth)
/// v_rel_n: velocidade relativa escalar na normal (J·v)
/// restitution: coeficiente de restituição do par
/// params: RBSimParams (lê baumgarte_beta, penetration_slop, restitution_threshold, gravity.w como dt)
fn lcp_bias(gap: f32, v_rel_n: f32, restitution: f32, params: RBSimParams) -> f32 {
    let dt        = params.gravity.w;
    let beta      = params.baumgarte_beta;
    let slop      = params.penetration_slop;
    let gap_eff   = min(gap + slop, 0.0);
    let baumgarte = beta * gap_eff / dt;
    let rest_term = select(0.0, restitution * v_rel_n,
                           v_rel_n < -params.restitution_threshold);
    return baumgarte + rest_term;
}

/// Um passo PGS para constraint de contato unilateral (normal).
/// j_v: velocidade relativa projetada na normal (J·v, escalar)
/// bias: bias calculado por lcp_bias
/// a_kk: diagonal de Delassus para este contato
/// lambda_acc: impulso normal acumulado do frame/iteração anterior
/// Retorna vec2f(delta_lambda, novo_lambda_acumulado).
fn lcp_pgs_step(j_v: f32, bias: f32, a_kk: f32, lambda_acc: f32) -> vec2f {
    let delta = -(j_v + bias) / max(a_kk, 1e-10);
    let new_l = max(lambda_acc + delta, 0.0);   // projeção Signorini: λ ≥ 0
    return vec2f(new_l - lambda_acc, new_l);
}

/// Um passo PGS para constraint de atrito (cone de Coulomb isotrópico).
/// j_v_t: velocidade relativa tangencial (vec2f, J_t · v)
/// a_kk_t: Delassus tangencial (escalar — mesma fórmula, direção tangente)
/// lambda_t_acc: acumulador tangencial (vec2f)
/// lambda_n: impulso normal acumulado (para limite do cone)
/// mu: coeficiente de atrito combinado
/// Retorna vec4f(delta_lambda_t.xy, novo_lambda_t_acc.xy)
fn lcp_pgs_step_friction(j_v_t: vec2f, a_kk_t: f32, lambda_t_acc: vec2f,
                          lambda_n: f32, mu: f32) -> vec4f {
    let safe_a    = max(a_kk_t, 1e-10);
    let delta     = -(j_v_t) / safe_a;
    let new_raw   = lambda_t_acc + delta;
    // Projeção no disco de Coulomb: |λₜ| ≤ μ · λₙ
    let max_t     = mu * max(lambda_n, 0.0);
    let len       = length(new_raw);
    let new_clamped = select(new_raw, new_raw * (max_t / max(len, 1e-10)), len > max_t);
    return vec4f(new_clamped - lambda_t_acc, new_clamped);
}
`;
