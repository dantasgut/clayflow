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

        // Bug P1-B — Penetration Slop: subtrai tolerância antes de aplicar correção
        let slop      = rb_params.penetration_slop;
        let depth_eff = max(depth - slop, 0.0);
        let delta_lambda_unclamped = xpbd_delta_lambda(-depth_eff, w_rb, alpha_tilde);
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
        let rxn       = cross(r, n);
        let ang_delta = vec3f(
            rxn.x * I_inv.x * d_lambda,
            rxn.y * I_inv.y * d_lambda,
            rxn.z * I_inv.z * d_lambda,
        );
        bodies[rb_i].rot_pred = quat_apply_angular_delta(bodies[rb_i].rot_pred, ang_delta);

        // Renormalização CRÍTICA — previne drift numérico
        bodies[rb_i].rot_pred = quat_normalize(bodies[rb_i].rot_pred);

        // Atualiza lambda para warm-starting
        contacts[ci].point.w = new_lambda;

        // ── Fricção de Coulomb ──────────────────────────────────────────────
        let mu       = bodies[rb_i].mat_props.y;
        if (mu <= 0.0) { continue; }

        // Velocidade no ponto de contato (usa vel/omega do frame anterior)
        let v_cp     = contact_point_velocity(bodies[rb_i].vel.xyz, bodies[rb_i].omega.xyz, r);
        let v_normal = dot(v_cp, n) * n;
        let v_tan    = v_cp - v_normal;
        let v_tan_len = length(v_tan);
        if (v_tan_len < 1e-8) { continue; }

        let t1    = v_tan / v_tan_len;
        let t2    = cross(n, t1);  // segunda tangente ortogonal

        let w_t1  = rigid_generalized_mass(r, t1, inv_mass, I_inv);
        let w_t2  = rigid_generalized_mass(r, t2, inv_mass, I_inv);

        // Bug P1-A — Coulomb Clamp Circular: max_t calculado UMA VEZ, compartilhado por t1 e t2
        let max_t = mu * new_lambda;

        // Impulso tangencial 1
        let lambda_tx_old  = contacts[ci].lambda_tx;
        let d_lambda_tx_u  = xpbd_delta_lambda(dot(v_tan, t1) * dt, w_t1, 0.0);
        let lambda_tx_new  = lambda_tx_old + d_lambda_tx_u;
        let lambda_tx_clamped = clamp(lambda_tx_new, -max_t, max_t);
        let d_tx = lambda_tx_clamped - lambda_tx_old;
        contacts[ci].lambda_tx = lambda_tx_clamped;

        // Impulso tangencial 2
        let lambda_ty_old  = contacts[ci].lambda_ty;
        let d_lambda_ty_u  = xpbd_delta_lambda(dot(v_tan, t2) * dt, w_t2, 0.0);
        let lambda_ty_new  = lambda_ty_old + d_lambda_ty_u;
        let lambda_ty_clamped = clamp(lambda_ty_new, -max_t, max_t);
        let d_ty = lambda_ty_clamped - lambda_ty_old;
        contacts[ci].lambda_ty = lambda_ty_clamped;

        // Aplica correção tangencial de posição e rotação
        let tan_corr = t1 * inv_mass * d_tx + t2 * inv_mass * d_ty;
        bodies[rb_i].pos_pred = vec4f(
            bodies[rb_i].pos_pred.xyz + tan_corr,
            bodies[rb_i].pos_pred.w,
        );

        let rxn_t1 = cross(r, t1);
        let rxn_t2 = cross(r, t2);
        let ang_tan = vec3f(
            (rxn_t1.x * I_inv.x * d_tx + rxn_t2.x * I_inv.x * d_ty),
            (rxn_t1.y * I_inv.y * d_tx + rxn_t2.y * I_inv.y * d_ty),
            (rxn_t1.z * I_inv.z * d_tx + rxn_t2.z * I_inv.z * d_ty),
        );
        bodies[rb_i].rot_pred = quat_apply_angular_delta(bodies[rb_i].rot_pred, ang_tan);
        bodies[rb_i].rot_pred = quat_normalize(bodies[rb_i].rot_pred);
    }
    } // fim loop k
}
`;
