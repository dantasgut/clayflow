// portado de legacy/elements/physics/gpu/wgsl/kernels/predict.wgsl.ts
// Campos de força (spec 009): `field_accel` lê os registros do ponto `field` (recursos declarados do módulo).

@compute @workgroup_size(WORKGROUP_SIZE)
fn predict_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid = vec3u(gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE, 0u, 0u);
    let i = gid.x;
    if (i >= params.particle_count || !pool_live(live[i >> 5u], i)) { return; }

    let inv_mass = particles[i].pos.w;
    if (inv_mass == 0.0) {
        // Partícula fixa: a predição é a própria posição (as restrições leem `pred`).
        particles[i].pred = vec4f(particles[i].pos.xyz, particles[i].pred.w);
        return;
    }

    // 1. Integra gravidade → velocidade (a conta de antes, intacta) e os campos, num termo à parte só quando não são
    // zero — sem campos, a mesma trajetória bit a bit (spec 009).
    var vel = particles[i].vel.xyz + params.gravity * params.dt;
    let body = FieldBody(inv_mass, params.field_density, 0.0, 0.0);
    let field = field_accel(particles[i].pos.xyz, particles[i].vel.xyz, params.field_time, body);
    if (any(field != vec3f(0.0))) { vel += field * params.dt; }

    // 2. Predição de posição (replica SoftBodyPredictStage)
    let pred = particles[i].pos.xyz + vel * params.dt;

    particles[i].vel  = vec4f(vel,  particles[i].vel.w);
    particles[i].pred = vec4f(pred, particles[i].pred.w);
}
