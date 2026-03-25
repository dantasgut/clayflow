/**
 * Kernel WGSL: rb_predict — integra forças e calcula posição/rotação previstas (XPBD Fase 1).
 *
 * Executa 1× por frame ANTES do loop de substeps.
 * Para cada corpo rígido dinâmico (inv_mass > 0):
 *   1. Aplica gravidade à velocidade externa: vel_ext = vel.xyz + gravity.xyz * dt
 *   2. Aplica correção giroscópica a omega via gyroscopic_correction()
 *   3. Aplica damping linear e angular
 *   4. Prediz posição: pos_pred = pos + vel_ext * dt
 *   5. Prediz rotação: rot_pred = quat_integrate(rot, omega_g, dt)
 *
 * NÃO modifica vel nem omega — preservados para rb_velocity_recovery ao final do frame.
 *
 * Bind groups:
 *   @group(0) @binding(0) — RBSimParams  (uniform)
 *   @group(0) @binding(1) — RigidBody[]  (storage read_write)
 *
 * Dispatch: ceil(body_count / 64) workgroups.
 *
 * Depende de: RBSimParams, RigidBody, impulse.wgsl (gyroscopic_correction), quat.wgsl (quat_integrate).
 */
export const WGSL_KERNEL_RB_PREDICT = /* wgsl */`

@group(0) @binding(0) var<uniform>             rb_params: RBSimParams;
@group(0) @binding(1) var<storage, read_write> bodies:    array<RigidBody>;

@compute @workgroup_size(64)
fn rb_predict_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= rb_params.body_count) { return; }

    let inv_mass = bodies[i].pos.w;
    if (inv_mass == 0.0) { return; }  // cinemático — ignora

    let dt  = rb_params.gravity.w;
    let vel = bodies[i].vel.xyz;
    let omega = bodies[i].omega.xyz;
    let rot = bodies[i].rot;
    let lin_damping = bodies[i].mat_props.z;
    let ang_damping = bodies[i].mat_props.w;

    // Aceleração gravitacional → velocidade externa
    let vel_ext = vel + rb_params.gravity.xyz * dt;

    // Correção giroscópica: usa I (não-invertido) = 1/I_inv para eixos válidos
    // I_inv.xyz = 1/I_diagonal → I_diagonal = 1/I_inv (onde I_inv > 0)
    let I_inv = bodies[i].I_inv.xyz;
    let I_safe = select(vec3f(1e6), 1.0 / I_inv, I_inv > vec3f(1e-12));
    let omega_g = gyroscopic_correction(omega, I_safe, dt);

    // Damping
    let vel_d   = vel_ext * (1.0 - lin_damping * dt);
    let omega_d = omega_g * (1.0 - ang_damping * dt);

    // Predição de posição
    let pos_pred = bodies[i].pos.xyz + vel_d * dt;

    // Predição de rotação: integração de quaternion
    let rot_pred = quat_integrate(rot, omega_d, dt);

    bodies[i].pos_pred = vec4f(pos_pred, bodies[i].pos_pred.w);
    bodies[i].rot_pred = rot_pred;
}
`;
