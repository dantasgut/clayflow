// Fronteira sólida do PBF (Akinci et al. 2012; spec 034): por partícula, a cada iteração do solver e antes da
// densidade, o volume do núcleo poly6 dentro dos sólidos e o gradiente dele (`fluid_boundary`) — lidos pela restrição
// de densidade e pela correção da mesma iteração —, e o sólido mais próximo no registro da partícula (`contact`, lido
// pelo campo dos fluidos e pelo ancoramento da gota solta).
// Grupo 2: conjunto de colliders (`collider_set.wgsl`); o núcleo da fronteira é o poly6 (`FLUID_BOUNDARY_KERNEL` = 1).

@compute @workgroup_size(WORKGROUP_SIZE)
fn pbf_boundary_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    collider_time = pbf_params.field_time;
    let gid = vec3u(gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE, 0u, 0u);
    let i = gid.x;
    if (i >= pbf_params.particle_count || !pool_live(live[i >> 5u], i)) { return; }
    let b = fluid_boundary(
        particles[i].pos.xyz, pbf_params.h, pbf_params.h,
        fluid_adhesion_min(pbf_params.bound_min, pbf_params.open_bounds),
    );
    pbf_boundary[i] = b.term;
    particles[i].contact = b.nearest;
}
