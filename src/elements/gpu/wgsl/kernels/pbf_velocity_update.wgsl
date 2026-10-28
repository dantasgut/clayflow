// portado de legacy/elements/physics/gpu/wgsl/kernels/pbf_velocity_update.wgsl.ts

@compute @workgroup_size(WORKGROUP_SIZE)
fn pbf_velocity_update_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    // Na ordem por célula: o posto `t` (a lista e a contagem de vizinhos) e a partícula `i` dele.
    let t = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let i = neighbor_particle(t, pbf_params.particle_count);
    if (i == NONE) { return; }

    let dt      = pbf_params.dt;
    let inv_dt  = select(0.0, 1.0 / dt, dt > 0.00001);

    let pos_new = particles[i].pos.xyz;
    let pos_old = particles[i].posOld.xyz;

    var vel = (pos_new - pos_old) * inv_dt;
    // Gota solta (spec 034): a borda ancorada num sólido que a água molha (`fluid_wet_pinning`); com outra água por
    // perto (vizinhas), volta à dinâmica do volume.
    if (pbf_params.wet_neighbors > 0u && neighbor_count[t] < pbf_params.wet_neighbors) {
        vel = fluid_wet_pinning(
            vel, particles[i].contact, 1.5 * pbf_params.collision_radius, pbf_params.wet_pinning, dt,
        );
    }
    particles[i].vel = vec4f(vel, 0.0);
}
