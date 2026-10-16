// portado de legacy/elements/physics/gpu/wgsl/kernels/rb_predict.wgsl.ts
// Campos de força (spec 009): registros e slots vivos do pool `FieldFnRecord`, ligados pela C2 (ponto `field`).

@compute @workgroup_size(WORKGROUP_SIZE)
fn rb_predict_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid = vec3u(gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE, 0u, 0u);
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

    // gravity.w = dt da região: o passo inteiro (predict roda 1× por passo).
    let dt  = rb_params.gravity.w;
    let vel = bodies[i].vel.xyz;
    let omega = bodies[i].omega.xyz;
    let rot = bodies[i].rot;
    let lin_damping = bodies[i].mat_props.z;
    let ang_damping = bodies[i].mat_props.w;

    // A gravidade entra por substep (rb_apply_gravity_main), antes da detecção e do solve de cada substep: o impulso
    // que a sustenta é o mesmo em todos os substeps e o warm start do substep anterior acerta (spec 004, R19).
    let vel_ext = vel;

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

// Gravidade de um substep: vel += g · dtSub (gravity.w da região do substep) nos corpos dinâmicos acordados, e os campos
// no centro de massa (spec 009; sem torque) num termo à parte, só quando não são zero — sem campos, bit a bit.
@compute @workgroup_size(WORKGROUP_SIZE)
fn rb_apply_gravity_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= rb_params.body_count) { return; }
    if (bodies[i].pos.w == 0.0 || bodies[i].vel.w > 0.5) { return; }
    let v_in = bodies[i].vel.xyz;
    bodies[i].vel = vec4f(bodies[i].vel.xyz + rb_params.gravity.xyz * rb_params.gravity.w, bodies[i].vel.w);
    let body = FieldBody(bodies[i].pos.w, rb_params.field_density, 0.0, 0.0);
    let field = field_accel(bodies[i].pos.xyz, v_in, rb_params.field_time, body);
    if (any(field != vec3f(0.0))) {
        bodies[i].vel = vec4f(bodies[i].vel.xyz + field * rb_params.gravity.w, bodies[i].vel.w);
    }
}
