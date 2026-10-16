// Aplicação das correções do PBF gravadas em `pbf_delta` (spec 005, R18): separar cálculo e escrita evita corrida entre
// a partícula que grava e os vizinhos que leem no mesmo passe — a simulação fica determinística.

@compute @workgroup_size(WORKGROUP_SIZE)
fn pbf_apply_position_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= pbf_params.particle_count || !pool_live(live[i >> 5u], i)) { return; }
    particles[i].pos = vec4f(particles[i].pos.xyz + pbf_delta[i].xyz, particles[i].pos.w);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn pbf_apply_velocity_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= pbf_params.particle_count || !pool_live(live[i >> 5u], i)) { return; }
    particles[i].vel = vec4f(particles[i].vel.xyz + pbf_delta[i].xyz, particles[i].vel.w);
}
