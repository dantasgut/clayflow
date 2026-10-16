// portado de legacy/elements/physics/gpu/wgsl/kernels/rb_lcp_commit.wgsl.ts
// Correção posicional e contatos por corpo em ponto fixo — rb_contact_accumulate (spec 004, R19).

@compute @workgroup_size(WORKGROUP_SIZE)
fn rb_lcp_commit_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid = vec3u(gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE, 0u, 0u);
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

    // Correção posicional e contato ativo acumulados por rb_contact_accumulate a partir da lista compactada.
    let pos_correction = vec3f(
        fixed_to_f32(atomicLoad(&body_correction[i].c_x), RB_FIXED_SCALE),
        fixed_to_f32(atomicLoad(&body_correction[i].c_y), RB_FIXED_SCALE),
        fixed_to_f32(atomicLoad(&body_correction[i].c_z), RB_FIXED_SCALE),
    );
    let has_contact = atomicLoad(&body_correction[i].contacts) > 0;

    // Sleep com temporizador (_rb_pad.x).
    // Corpo só dorme se: em contato E vel/omega abaixo do threshold E timer >= 0.5 s.
    // O timer acumula dt_frame a cada frame abaixo do threshold e reseta se acima.
    // Sem timer, o sleep dispara no ponto de retorno de qualquer oscilação (omega = 0),
    // travando o corpo em posição improvável após a primeira oscilação.
    let sleep_sq    = rb_params.sleep_lin_threshold * rb_params.sleep_lin_threshold;
    var sleep_timer = bodies[i]._rb_pad.x;
    var is_sleeping = false;

    if (sleep_sq > 0.0 && has_contact
        && dot(final_vel,   final_vel)   < sleep_sq
        && dot(final_omega, final_omega) < sleep_sq * 25.0) {
        sleep_timer += dt;
        if (sleep_timer >= 0.5) {
            final_vel   = vec3f(0.0);
            final_omega = vec3f(0.0);
            is_sleeping = true;
        }
    } else {
        sleep_timer = 0.0;
    }

    // Avança posição pela velocidade corrigida (não por pos_pred!)
    var new_pos = bodies[i].pos.xyz + final_vel * dt + pos_correction;

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
    bodies[i]._rb_pad  = vec4f(sleep_timer, bodies[i]._rb_pad.yzw);
}
