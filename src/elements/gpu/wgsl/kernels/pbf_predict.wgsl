// portado de legacy/elements/physics/gpu/wgsl/kernels/pbf_predict.wgsl.ts
@group(0) @binding(0) var<uniform>             pbf_params: PBFSimParams;
@group(1) @binding(0) var<storage, read_write> particles:  array<PBFParticle>;
@group(1) @binding(1) var<storage, read>       live: array<u32>;  // slots vivos do pool (spec 008)
// Campos de força (spec 009): registros e slots vivos do pool `FieldFnRecord`, ligados pela C2 (ponto `field`).
@group(1) @binding(2) var<storage, read>       field_records: array<FieldFnRecord>;
@group(1) @binding(3) var<storage, read>       field_live:    array<u32>;
// Grupo 2: conjunto de colliders (`collider_set.wgsl`), para a adesão (spec 030).

@compute @workgroup_size(64)
fn pbf_predict_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Tempo da iteração: escolhe a cópia do passo nos colliders de superfície (spec 010).
    collider_time = pbf_params.field_time;
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid = vec3u(gid3.x + gid3.y * nwg.x * 64u, 0u, 0u);
    let i = gid.x;
    if (i >= pbf_params.particle_count || !pool_live(live[i >> 5u], i)) { return; }

    let dt = pbf_params.dt;
    let g  = pbf_params.gravity;

    var p = particles[i];

    // Salva posição anterior ao substep
    p.posOld = p.pos;

    // Semi-implicit Euler: vel first, then pos
    let v_in = p.vel.xyz;
    p.vel = vec4f(p.vel.xyz + dt * g, 0.0);
    // Campos (spec 009): termo à parte, só quando não são zero — sem campos, a mesma trajetória bit a bit.
    let body = FieldBody(1.0 / pbf_params.particle_mass, pbf_params.field_density, pbf_params.mass_over_density, 0.0);
    let field = field_accel(p.pos.xyz, v_in, pbf_params.field_time, body);
    if (any(field != vec3f(0.0))) { p.vel = vec4f(p.vel.xyz + dt * field, 0.0); }

    // Adesão às fronteiras (spec 030): uma vez por iteração, junto da gravidade (a colisão roda N vezes no solver).
    if (pbf_params.adhesion_accel > 0.0) {
        var v = p.vel.xyz;
        collider_set_adhesion(
            p.pos.xyz, &v, pbf_params.support, pbf_params.adhesion_accel, pbf_params.adhesion_tangential, dt,
            fluid_adhesion_min(pbf_params.bound_min, pbf_params.open_bounds),
        );
        p.vel = vec4f(v, 0.0);
    }
    p.pos = vec4f(p.pos.xyz + dt * p.vel.xyz, p.pos.w);

    particles[i] = p;
}
