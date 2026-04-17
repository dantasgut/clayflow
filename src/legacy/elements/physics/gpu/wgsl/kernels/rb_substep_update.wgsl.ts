/**
 * Kernel WGSL: rb_substep_update — finaliza cada substep do loop XPBD.
 *
 * Executa 1× ao final de CADA substep (N vezes por frame).
 * Para cada corpo rígido dinâmico (inv_mass > 0):
 *   1. Deriva velocidade linear:  vel   = (pos_pred - pos) / dtSub
 *   2. Deriva velocidade angular: omega = quat_delta_omega(rot_pred, rot, 1/dtSub)
 *   3. Avança estado: pos = pos_pred, rot = normalize(rot_pred)
 *
 * Sem damping nem sleep — aplicados uma única vez em rb_velocity_recovery (após o loop).
 *
 * Bind groups:
 *   @group(0) @binding(0) — RBSimParams  (uniform)
 *   @group(0) @binding(1) — RigidBody[]  (storage read_write)
 *
 * Dispatch: ceil(body_count / 64) workgroups.
 *
 * Depende de: RBSimParams, RigidBody, quat.wgsl (quat_delta_omega, quat_normalize).
 */
export const WGSL_KERNEL_RB_SUBSTEP_UPDATE = /* wgsl */`

@group(0) @binding(0) var<uniform>             rb_params: RBSimParams;
@group(0) @binding(1) var<storage, read_write> bodies:    array<RigidBody>;

@compute @workgroup_size(64)
fn rb_substep_update_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= rb_params.body_count) { return; }

    let inv_mass = bodies[i].pos.w;
    if (inv_mass == 0.0) { return; }  // cinemático — ignora

    // dtSub está em gravity.w
    let dtSub = rb_params.gravity.w;
    if (dtSub < 1e-12) { return; }
    let inv_dtSub = 1.0 / dtSub;

    // Deriva velocidade linear: (pos_pred - pos) / dtSub
    let new_vel   = (bodies[i].pos_pred.xyz - bodies[i].pos.xyz) * inv_dtSub;

    // Deriva velocidade angular a partir da variação de quaternion
    let rot_pred_n = quat_normalize(bodies[i].rot_pred);
    let new_omega  = quat_delta_omega(rot_pred_n, bodies[i].rot, inv_dtSub);

    // Avança estado: pos_pred → pos, rot_pred → rot
    bodies[i].vel   = vec4f(new_vel,   bodies[i].vel.w);
    bodies[i].omega = vec4f(new_omega, bodies[i].omega.w);
    bodies[i].pos   = vec4f(bodies[i].pos_pred.xyz, bodies[i].pos.w);
    bodies[i].rot   = rot_pred_n;
}
`;
