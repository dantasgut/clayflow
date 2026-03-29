/**
 * Kernel WGSL: rb_predict — integra forças e calcula posição/rotação previstas (XPBD Fase 1).
 *
 * Executa 1× por frame ANTES do loop de substeps.
 * Para cada corpo rígido dinâmico (inv_mass > 0):
 *   1. Aplica gravidade à velocidade externa: vel_ext = vel.xyz + gravity.xyz * dt_frame
 *   2. Aplica correção giroscópica a omega via gyroscopic_correction()
 *   3. Aplica damping linear e angular
 *   4. Prediz posição: pos_pred = pos + vel_ext * dt_frame
 *   5. Prediz rotação: rot_pred = quat_integrate(rot, omega_g, dt_frame)
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

    // Sleep real: corpo dorme quando vel.w = 1 (setado por rb_velocity_recovery).
    // Pula gravidade e predição — pos_pred = pos mantém o corpo parado.
    // O corpo acorda quando rb_solve corrige pos_pred (colisão com outro corpo).
    if (bodies[i].vel.w > 0.5) {
        bodies[i].pos_pred = bodies[i].pos;
        bodies[i].rot_pred = bodies[i].rot;
        return;
    }

    // Usa dtSub (gravity.w) — predict roda dentro do loop de substeps.
    // dt_frame seria 16ms; dtSub = dt_frame/substeps reduz penetração por substep.
    let dt  = rb_params.gravity.w;
    let vel = bodies[i].vel.xyz;
    let omega = bodies[i].omega.xyz;
    let rot = bodies[i].rot;
    let lin_damping = bodies[i].mat_props.z;
    let ang_damping = bodies[i].mat_props.w;

    // Aceleração gravitacional → velocidade externa (semi-implicit Euler: força antes do solver).
    // Para o pipeline LCP: rb_build_lcp e rb_solve_lcp lêem vel depois deste kernel,
    // portanto gravidade deve estar em vel antes do solver para que o PGS a corrija.
    // Para o pipeline XPBD: rb_substep_update sobrescreve vel com (pos_pred-pos)/dtSub
    // imediatamente após cada substep — esta escrita é inofensiva (invisível ao XPBD).
    let vel_ext = vel + rb_params.gravity.xyz * dt;
    bodies[i].vel = vec4f(vel_ext, bodies[i].vel.w);

    // Correção giroscópica: usa I (não-invertido) = 1/I_inv para eixos válidos
    // I_inv.xyz = 1/I_diagonal → I_diagonal = 1/I_inv (onde I_inv > 0)
    let I_inv = bodies[i].I_inv.xyz;
    let I_safe = select(vec3f(1e6), 1.0 / I_inv, I_inv > vec3f(1e-12));
    let omega_g = gyroscopic_correction(omega, I_safe, dt);

    // Damping exponencial: frame-rate independent (exp(-k*dt) correto para k*dt qualquer).
    let vel_d   = vel_ext * exp(-lin_damping * dt);
    let omega_d = omega_g * exp(-ang_damping * dt);

    // Predição de posição
    let pos_pred = bodies[i].pos.xyz + vel_d * dt;

    // Predição de rotação: integração de quaternion
    let rot_pred = quat_integrate(rot, omega_d, dt);

    bodies[i].pos_pred = vec4f(pos_pred, bodies[i].pos_pred.w);
    bodies[i].rot_pred = rot_pred;
}
`;
