/**
 * Kernel WGSL: rb_lcp_commit — avança posição pela velocidade corrigida pelo LCP solver.
 *
 * Substituto de rb_velocity_recovery para o pipeline LCP.
 * O LCP solver (rb_solve_lcp) modifica vel/omega diretamente; rb_velocity_recovery
 * calcula vel = (pos_pred - pos)/dt que ignora as correções do solver.
 * Este kernel usa a velocidade já corrigida para avançar a posição.
 *
 * Executa 1× por frame, APÓS rb_solve_lcp.
 *
 * Para cada corpo dinâmico (inv_mass > 0):
 *   1. Lê vel/omega já corrigidos por rb_solve_lcp
 *   2. Aplica damping linear/angular
 *   3. Pseudo-sleep (zera se abaixo do threshold)
 *   4. Avança posição: pos = pos + vel * dt
 *   5. Avança rotação: rot = quat_integrate(rot, omega, dt)
 *   6. Atualiza pos_pred = nova pos (para narrowphase do próximo frame usar r correto)
 *
 * Bind groups:
 *   @group(0) @binding(0) — RBSimParams (uniform)
 *   @group(0) @binding(1) — RigidBody[] (storage read_write)
 *
 * Dispatch: ceil(body_count / 64) workgroups.
 *
 * Depende de: RBSimParams, RigidBody, quat.wgsl (quat_integrate, quat_normalize).
 */
export const WGSL_KERNEL_RB_LCP_COMMIT = /* wgsl */`

@group(0) @binding(0) var<uniform>             rb_params: RBSimParams;
@group(0) @binding(1) var<storage, read_write> bodies:    array<RigidBody>;
@group(0) @binding(2) var<storage, read>       contacts:  array<RBContact>;

@compute @workgroup_size(64)
fn rb_lcp_commit_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= rb_params.body_count) { return; }

    let inv_mass = bodies[i].pos.w;
    if (inv_mass == 0.0) { return; }  // cinemático — ignora

    // Para o pipeline LCP, gravity.w = dtFrame (LCPComputePass define SP_DT = dtFrame).
    // rb_predict (que escreve vel += g*dt) e rb_lcp_commit rodam 1× por frame.
    let dt = rb_params.dt_frame;
    if (dt < 1e-12) { return; }

    // Velocidades já corrigidas pelo LCP solver (rb_solve_lcp).
    // Gravidade foi pré-integrada em rb_predict (vel_ext → vel), antes do solver.
    let vel   = bodies[i].vel.xyz;
    let omega = bodies[i].omega.xyz;

    // Damping
    let lin_damp = max(1.0 - rb_params.linear_damping  * dt, 0.0);
    let ang_damp = max(1.0 - rb_params.angular_damping * dt, 0.0);
    var final_vel   = vel   * lin_damp;
    var final_omega = omega * ang_damp;

    // Avança posição pela velocidade corrigida (não por pos_pred!)
    var new_pos = bodies[i].pos.xyz + final_vel * dt;

    // Correção posicional + detecção de contato ativo num único loop.
    // _pad3 armazena o SDF real 'd' (sem d_speculative) — negativo = penetração real.
    // has_contact: true se qualquer slot está ativo — necessário para a condição de sleep.
    let col_count = rb_params.collider_count;
    var pos_correction = vec3f(0.0);
    var has_contact = false;
    for (var j = 0u; j < col_count; j++) {
        let slot = i * col_count + j;
        if (contacts[slot].is_active == 0u) { continue; }
        has_contact = true;
        let actual_d = contacts[slot]._pad3;            // SDF real no ponto de teste
        let slop     = rb_params.penetration_slop;
        if (actual_d >= -slop) { continue; }            // especulativo ou dentro do slop — não precisa
        let corr_depth = -(actual_d + slop);            // profundidade além do slop
        pos_correction += contacts[slot].normal.xyz * corr_depth * 0.1;
    }
    new_pos += pos_correction;

    // Pseudo-sleep: zera velocidades e marca corpo como dormindo.
    // Condição has_contact evita sleep no ar (ex.: pico do quique, vel ≈ 0 momentaneamente).
    // vel.w = 1.0 → dormindo (rb_predict ignora gravidade e mantém pos_pred = pos).
    // vel.w = 0.0 → acordado (rb_predict integra gravidade normalmente).
    let sleep_sq = rb_params.sleep_lin_threshold * rb_params.sleep_lin_threshold;
    var is_sleeping = false;
    if (sleep_sq > 0.0 && has_contact
        && dot(final_vel,   final_vel)   < sleep_sq
        && dot(final_omega, final_omega) < sleep_sq * 25.0) {
        final_vel   = vec3f(0.0);
        final_omega = vec3f(0.0);
        is_sleeping = true;
    }

    let new_rot = quat_normalize(quat_integrate(bodies[i].rot, final_omega, dt));

    // Escreve estado
    bodies[i].vel      = vec4f(final_vel,   select(0.0, 1.0, is_sleeping));
    bodies[i].omega    = vec4f(final_omega, bodies[i].omega.w);
    bodies[i].pos      = vec4f(new_pos,     bodies[i].pos.w);
    bodies[i].rot      = new_rot;
    // Atualiza pos_pred = new_pos para que o próximo frame calcule r corretamente
    // no narrowphase: r = contact.point - pos_pred
    bodies[i].pos_pred = vec4f(new_pos,  bodies[i].pos_pred.w);
    bodies[i].rot_pred = new_rot;
}
`;
