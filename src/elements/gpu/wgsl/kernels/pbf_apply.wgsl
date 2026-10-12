// Aplicação das correções do PBF gravadas em `pbf_delta` (spec 005, R18): separar cálculo e escrita evita corrida entre
// a partícula que grava e os vizinhos que leem no mesmo passe — a simulação fica determinística.
@group(0) @binding(0) var<uniform>             pbf_params: PBFSimParams;
@group(1) @binding(0) var<storage, read_write> particles:  array<PBFParticle>;
@group(2) @binding(0) var<storage, read>       pbf_delta:  array<vec4f>;

@compute @workgroup_size(64)
fn pbf_apply_position_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let i = gid3.x + gid3.y * nwg.x * 64u;
    if (i >= pbf_params.counts.x) { return; }
    particles[i].pos = vec4f(particles[i].pos.xyz + pbf_delta[i].xyz, particles[i].pos.w);
}

@compute @workgroup_size(64)
fn pbf_apply_velocity_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let i = gid3.x + gid3.y * nwg.x * 64u;
    if (i >= pbf_params.counts.x) { return; }
    particles[i].vel = vec4f(particles[i].vel.xyz + pbf_delta[i].xyz, particles[i].vel.w);
}
