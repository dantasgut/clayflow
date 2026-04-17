/**
 * Kernel WGSL: rb_solve — PGS Gauss-Seidel posicional para contatos corpo rígido.
 *
 * Executa 1× por substep (serial — @workgroup_size(1), dispatch(1,1,1)).
 * Loop interno de K=rb_params.solve_iters iterações Gauss-Seidel dentro do shader,
 * eliminando o hazard de memória que existiria entre K dispatches separados no mesmo pass.
 * Thread única itera todos os slots de contato ativos e aplica correção XPBD posicional.
 *
 * Para cada contato ativo:
 *   1. Carrega corpo rígido e vetor r (CM → ponto de contato)
 *   2. Calcula massa generalizada rigid_generalized_mass(r, n, inv_mass, I_inv)
 *   3. Calcula Δλ XPBD com alpha_tilde=0 (contato rígido, sem compliance)
 *   4. Aplica clamp unilateral: new_lambda = max(lambda_old + Δλ, 0)
 *   5. Aplica correção posicional e angular a pos_pred/rot_pred
 *   6. Renormaliza rot_pred (CRÍTICO para estabilidade numérica)
 *   7. Atualiza lambda_n para warm-starting do próximo frame
 *   8. Aplica fricção de Coulomb tangencial
 *
 * Bind groups:
 *   @group(0) @binding(0) — RBSimParams  (uniform)
 *   @group(0) @binding(1) — RigidBody[]  (storage read_write)
 *   @group(0) @binding(2) — RBContact[]  (storage read_write)
 *
 * Dispatch: 1 workgroup (serial Gauss-Seidel) — 1× por substep.
 *
 * Depende de: RBSimParams, RigidBody, RBContact,
 *             xpbd.wgsl (rigid_generalized_mass, xpbd_delta_lambda),
 *             impulse.wgsl (coulomb_clamp, contact_point_velocity),
 *             quat.wgsl (quat_apply_angular_delta, quat_normalize).
 */
export const WGSL_KERNEL_RB_SOLVE = /* wgsl */`

@group(0) @binding(0) var<uniform>             rb_params: RBSimParams;
@group(0) @binding(1) var<storage, read_write> bodies:    array<RigidBody>;
@group(0) @binding(2) var<storage, read_write> contacts:  array<RBContact>;

@compute @workgroup_size(1)
fn rb_solve_main(@builtin(global_invocation_id) _gid: vec3u) {
    let dt = rb_params.gravity.w;

    // Loop K interno — elimina hazard de memória entre dispatches (arquitetura: ver rb_sim_params)
    for (var k = 0u; k < rb_params.solve_iters; k++) {
    for (var ci = 0u; ci < rb_params.max_contacts; ci++) {
        if (contacts[ci].is_active == 0u) { continue; }

        let rb_i     = contacts[ci].rb_idx;
        let inv_mass = bodies[rb_i].pos.w;
        if (inv_mass == 0.0) { continue; }  // cinemático — ignora

        let n     = contacts[ci].normal.xyz;
        let depth = contacts[ci].normal.w;   // positivo = penetração

        let r = contacts[ci].point.xyz - bodies[rb_i].pos_pred.xyz;

        let I_inv = bodies[rb_i].I_inv.xyz;
        let w_rb  = rigid_generalized_mass(r, n, inv_mass, I_inv);

        // XPBD: C = depth (violação positiva = penetração)
        let alpha_tilde = 0.0;  // contato rígido, sem compliance
        let lambda_old  = contacts[ci].point.w;

        // XPBD puro: corrige toda a penetração sem slop.
        // Slop condicional (qualquer variante) deixa o corpo propositalmente enterrado,
        // gerando velocity residual upward toda frame via pos_pred-pos → moto-contínuo.
        let C_eff = -depth;
        let delta_lambda_unclamped = xpbd_delta_lambda(C_eff, w_rb, alpha_tilde);
        let new_lambda = max(lambda_old + delta_lambda_unclamped, 0.0);
        let d_lambda   = new_lambda - lambda_old;

        if (abs(d_lambda) < 1e-10) {
            contacts[ci].point.w = new_lambda;
            continue;
        }

        // Correção posicional
        let pos_corr = n * inv_mass * d_lambda;
        bodies[rb_i].pos_pred = vec4f(
            bodies[rb_i].pos_pred.xyz + pos_corr,
            bodies[rb_i].pos_pred.w,
        );

        // Correção angular: Δang = I_inv × (r × n) × Δλ, aplica via quat_apply_angular_delta
        let rxn = cross(r, n);
        var ang_delta = vec3f(
            rxn.x * I_inv.x * d_lambda,
            rxn.y * I_inv.y * d_lambda,
            rxn.z * I_inv.z * d_lambda,
        );

        // Clamp angular: limita giro máximo por iteração.
        // Com dt=16ms e solver serial, d_lambda pode ser grande → ang_delta explode > 1 rad.
        // quat_apply_angular_delta usa integração Euler explícita que falha para |ang| > ~0.2 rad,
        // invertendo o quaternion e gerando arremesso catastrófico (gangorra de energia).
        let max_ang = 0.2;
        let ang_len = length(ang_delta);
        if (ang_len > max_ang) {
            ang_delta = ang_delta * (max_ang / ang_len);
        }

        bodies[rb_i].rot_pred = quat_apply_angular_delta(bodies[rb_i].rot_pred, ang_delta);

        // Renormalização CRÍTICA — previne drift numérico
        bodies[rb_i].rot_pred = quat_normalize(bodies[rb_i].rot_pred);

        // Atualiza lambda para warm-starting
        // Fricção movida para rb_solve_velocity (velocity space) — Müller 2020
        contacts[ci].point.w = new_lambda;
    }
    } // fim loop k
}
`;
