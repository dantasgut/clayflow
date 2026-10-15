// portado de legacy/elements/physics/gpu/wgsl/kernels/predict.wgsl.ts
@group(0) @binding(0) var<uniform>             params:    SimParams;
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(2) var<storage, read>       live: array<u32>;  // slots vivos do pool (spec 008)
// Campos de força (spec 009): registros e slots vivos do pool `FieldFnRecord`, ligados pela C2 (ponto `field`).
@group(0) @binding(3) var<storage, read>       field_records: array<FieldFnRecord>;
@group(0) @binding(4) var<storage, read>       field_live:    array<u32>;

@compute @workgroup_size(64)
fn predict_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid = vec3u(gid3.x + gid3.y * nwg.x * 64u, 0u, 0u);
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
