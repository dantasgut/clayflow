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

    let dt = rb_params.gravity.w;
    if (dt < 1e-12) { return; }
    let inv_dt = 1.0 / dt;

    // Recupera velocidade linear: (pos_pred - pos) / dt
    let new_vel = (bodies[i].pos_pred.xyz - bodies[i].pos.xyz) * inv_dt;

    // Recupera velocidade angular a partir da variação de quaternion
    let rot_pred_n = quat_normalize(bodies[i].rot_pred);
    let new_omega  = quat_delta_omega(rot_pred_n, bodies[i].rot, inv_dt);

    // Copia estado previsto → estado atual
    bodies[i].vel   = vec4f(new_vel,  0.0);
    bodies[i].omega = vec4f(new_omega, 0.0);
    bodies[i].pos   = vec4f(bodies[i].pos_pred.xyz, bodies[i].pos.w);
    bodies[i].rot   = rot_pred_n;
}
`;
