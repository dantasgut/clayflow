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

    // vel e pos já foram atualizados pelo último rb_substep_update.
    // Este kernel aplica apenas damping global e pseudo-sleep.

    // Global Damping: usa dt_frame (1× por frame).
    let dtFrame  = rb_params.dt_frame;
    // exp(-k*dt) é correto para damping viscoso — fórmula linear 1-k*dt gera terminal vel=g/k.
    // Com k=0.05 e fórmula linear, terminal vel = 9.8/0.05 = 196 m/s (praticamente sem damping).
    let lin_damp = exp(-rb_params.linear_damping  * dtFrame);
    let ang_damp = exp(-rb_params.angular_damping * dtFrame);

    var final_vel   = bodies[i].vel.xyz   * lin_damp;
    var final_omega = bodies[i].omega.xyz * ang_damp;

    // Pseudo-sleep: corpos em repouso após substepping têm vel≈0 naturalmente.
    let sleep_sq = rb_params.sleep_lin_threshold * rb_params.sleep_lin_threshold;
    let speed_sq = dot(final_vel, final_vel);
    let omega_sq = dot(final_omega, final_omega);
    if (sleep_sq > 0.0 && speed_sq < sleep_sq && omega_sq < sleep_sq * 25.0) {
        final_vel   = vec3f(0.0);
        final_omega = vec3f(0.0);
    }

    bodies[i].vel   = vec4f(final_vel,   bodies[i].vel.w);
    bodies[i].omega = vec4f(final_omega, bodies[i].omega.w);
}
`;
