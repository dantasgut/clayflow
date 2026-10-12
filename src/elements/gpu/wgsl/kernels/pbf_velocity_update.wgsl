// portado de legacy/elements/physics/gpu/wgsl/kernels/pbf_velocity_update.wgsl.ts
@group(0) @binding(0) var<uniform>             pbf_params: PBFSimParams;
@group(1) @binding(0) var<storage, read_write> particles:  array<PBFParticle>;

@compute @workgroup_size(64)
fn pbf_velocity_update_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid = vec3u(gid3.x + gid3.y * nwg.x * 64u, 0u, 0u);
    let i = gid.x;
    if (i >= pbf_params.particle_count) { return; }

    let dt      = pbf_params.dt;
    let inv_dt  = select(0.0, 1.0 / dt, dt > 0.00001);

    let pos_new = particles[i].pos.xyz;
    let pos_old = particles[i].posOld.xyz;

    particles[i].vel = vec4f((pos_new - pos_old) * inv_dt, 0.0);
}
