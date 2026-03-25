/**
 * Módulo WGSL: núcleo matemático XPBD.
 *
 * Funções compartilhadas entre SoftBody (constraints de distância, colisão
 * partícula-SDF) e RigidBody (constraints de contato posicional — Fase 3).
 *
 * Referência: Müller et al. 2020, "Detailed Rigid Body Simulation with
 * Extended Position Based Dynamics".
 *
 * Depende de: nenhum outro módulo.
 */
export const WGSL_XPBD = /* wgsl */`

// ── Núcleo XPBD ──────────────────────────────────────────────────────────────

// Calcula Δλ para uma constraint escalar XPBD.
//   C          — violação da constraint (ex: |Δp| - restLength)
//   w_sum      — soma das massas generalizadas (wi + wj)
//   alpha_tilde — compliance normalizado (c / dt²)
// Replica o núcleo de DistanceConstraintStage.solveOne() e SolveStage.solveContact().
fn xpbd_delta_lambda(C: f32, w_sum: f32, alpha_tilde: f32) -> f32 {
    let denom = w_sum + alpha_tilde;
    if (denom < 1e-12) { return 0.0; }
    return -C / denom;
}

// Aplica a correção de posição ao ponto p de uma partícula.
//   p           — posição prevista atual
//   w           — massa inversa da partícula
//   delta_lambda — multiplicador de Lagrange calculado por xpbd_delta_lambda
//   n           — direção da constraint (normalizada)
// Para constraint de distância: pi += -wi·Δλ·n̂, pj += +wj·Δλ·n̂
fn xpbd_position_correction(p: vec3f, w: f32, delta_lambda: f32, n: vec3f) -> vec3f {
    return p - w * delta_lambda * n;
}

// Massa generalizada de um corpo rígido para um eixo de impulso (translação + rotação).
//   r     — vetor do centro de massa ao ponto de contato
//   n     — direção do impulso (normal ou tangente)
//   inv_m — massa inversa (0 para corpo cinemático)
//   I_inv — tensor de inércia inverso (diagonal, espaço local do corpo)
// Replica ContactImpulseKernel.axis(): invMA + (r_A×n)·I_A⁻¹·(r_A×n)
fn rigid_generalized_mass(r: vec3f, n: vec3f, inv_m: f32, I_inv: vec3f) -> f32 {
    let rxn = cross(r, n);
    let ang = rxn.x*rxn.x*I_inv.x + rxn.y*rxn.y*I_inv.y + rxn.z*rxn.z*I_inv.z;
    return inv_m + ang;
}
`;
