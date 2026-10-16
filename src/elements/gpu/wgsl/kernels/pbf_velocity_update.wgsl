// portado de legacy/elements/physics/gpu/wgsl/kernels/pbf_velocity_update.wgsl.ts

@compute @workgroup_size(WORKGROUP_SIZE)
fn pbf_velocity_update_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid = vec3u(gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE, 0u, 0u);
    let i = gid.x;
    if (i >= pbf_params.particle_count || !pool_live(live[i >> 5u], i)) { return; }

    let dt      = pbf_params.dt;
    let inv_dt  = select(0.0, 1.0 / dt, dt > 0.00001);

    let pos_new = particles[i].pos.xyz;
    let pos_old = particles[i].posOld.xyz;

    particles[i].vel = vec4f((pos_new - pos_old) * inv_dt, 0.0);
}
