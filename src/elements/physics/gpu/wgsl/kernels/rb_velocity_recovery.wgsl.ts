/**
 * Kernel WGSL: rb_velocity_recovery — recupera velocidades a partir das posições corrigidas.
 *
 * Executa 1× por frame APÓS o loop de substeps.
 * Para cada corpo rígido dinâmico (inv_mass > 0):
 *   1. Deriva velocidade linear:  new_vel   = (pos_pred - pos) / dt
 *   2. Deriva velocidade angular: new_omega = quat_delta_omega(rot_pred, rot, 1/dt)
 *   3. Copia pos_pred → pos, normalize(rot_pred) → rot
 *
 * A restituição não é aplicada aqui (simplificação Phase 3):
 * a correção posicional em rb_solve é suficiente para resposta de contato.
 *
 * Bind groups:
 *   @group(0) @binding(0) — RBSimParams  (uniform)
 *   @group(0) @binding(1) — RigidBody[]  (storage read_write)
 *
 * Dispatch: ceil(body_count / 64) workgroups.
 *
 * Depende de: RBSimParams, RigidBody, quat.wgsl (quat_delta_omega, quat_normalize).
 */
export const WGSL_KERNEL_RB_VELOCITY_RECOVERY = /* wgsl */`

@group(0) @binding(0) var<uniform>             rb_params: RBSimParams;
@group(0) @binding(1) var<storage, read_write> bodies:    array<RigidBody>;

@compute @workgroup_size(64)
fn rb_velocity_recovery_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= rb_params.body_count) { return; }

    let inv_mass = bodies[i].pos.w;
    if (inv_mass == 0.0) { return; }  // cinemático — ignora

    // Usa dt_frame (não dtSub) — pos_pred acumulou correções de N substeps;
    // dividir por dtSub amplificaria velocidades em fator N (arremesso/velocity explosion).
    let dt = rb_params.dt_frame;
    if (dt < 1e-12) { return; }
    let inv_dt = 1.0 / dt;

    // Recupera velocidade linear: (pos_pred - pos) / dt_frame
    let raw_vel = (bodies[i].pos_pred.xyz - bodies[i].pos.xyz) * inv_dt;

    // ── Correção anti-arremesso (velocity clamping) ───────────────────────────
    // Decompõe a correção de velocidade na direção da gravidade e na perpendicular.
    // Clampeia apenas o componente ao longo da gravidade para evitar que correções
    // posicionais (rb_solve) gerem velocidades explosivas no contato.
    let g_xyz = rb_params.gravity.xyz;
    let g_len = length(g_xyz);
    var new_vel = raw_vel;

    if (g_len > 1e-6) {
        let g_dir       = g_xyz / g_len;
        let vel_old     = bodies[i].vel.xyz;
        let expected    = vel_old + g_xyz * dt;          // velocidade esperada sem contato
        let correction  = raw_vel - expected;            // quanto rb_solve acrescentou

        let corr_g      = dot(correction, g_dir);        // componente na direção da gravidade
        let approach_g  = dot(expected, g_dir);          // >0 se caindo na direção de g

        // Clampeia a componente de correção ao longo de g:
        // não pode reverter mais do que a velocidade de aproximação × (1 + restitution).
        var corr_g_clamped = corr_g;
        if (approach_g > 1e-6) {
            // Restitution threshold: abaixo da velocidade de aproximação, não aplicar bounce
            let rest_threshold       = rb_params.restitution_threshold;
            let effective_restitution = select(rb_params.restitution, 0.0, approach_g <= rest_threshold);
            let max_bounce           = approach_g * (1.0 + effective_restitution);
            corr_g_clamped           = max(corr_g, -max_bounce);
        }

        let corr_perp   = correction - corr_g * g_dir;   // mantém correções laterais intactas
        new_vel         = expected + corr_g_clamped * g_dir + corr_perp;
    }

    // Recupera velocidade angular a partir da variação de quaternion
    let rot_pred_n = quat_normalize(bodies[i].rot_pred);
    let new_omega  = quat_delta_omega(rot_pred_n, bodies[i].rot, inv_dt);

    // Bug P2-D — Global Damping: aplica amortecimento linear e angular por substep
    let dtSub    = rb_params.gravity.w;  // dtSub está em gravity.w
    let lin_damp = 1.0 - rb_params.linear_damping  * dtSub;
    let ang_damp = 1.0 - rb_params.angular_damping * dtSub;

    var final_vel   = new_vel   * lin_damp;
    var final_omega = new_omega * ang_damp;

    // Pseudo-sleep: zera velocidade abaixo do threshold (desativado quando threshold = 0.0)
    // Fator 25.0 para omega: (5 rad/s)² / (1 cm/s)² — threshold angular ~5× maior
    let sleep_sq  = rb_params.sleep_lin_threshold * rb_params.sleep_lin_threshold;
    let speed_sq  = dot(final_vel, final_vel);
    let omega_sq  = dot(final_omega, final_omega);
    if (sleep_sq > 0.0 && speed_sq < sleep_sq && omega_sq < sleep_sq * 25.0) {
        final_vel   = vec3f(0.0);
        final_omega = vec3f(0.0);
    }

    // Copia estado previsto → estado atual (preserva .w em vez de escrever 0.0 fixo)
    bodies[i].vel   = vec4f(final_vel,   bodies[i].vel.w);
    bodies[i].omega = vec4f(final_omega, bodies[i].omega.w);
    bodies[i].pos   = vec4f(bodies[i].pos_pred.xyz, bodies[i].pos.w);
    bodies[i].rot   = rot_pred_n;
}
`;
