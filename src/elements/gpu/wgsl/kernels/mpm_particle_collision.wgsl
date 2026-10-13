// Salvaguarda das partículas MPM contra penetração em colliders (spec 005, R18), depois do G2P. A fronteira é imposta
// na grade (`mpm_grid_update`, faixa de uma célula); aqui só a partícula que ainda assim ficou dentro de um collider
// volta à superfície (raio 0 — projetar com raio maior moveria partículas sem atualizar o J e compactaria o fluido).
@group(0) @binding(0) var<uniform>             mpm_params: MPMSimParams;
@group(1) @binding(0) var<storage, read_write> particles:  array<MPMParticle>;
@group(1) @binding(1) var<storage, read>       live: array<u32>;  // slots vivos do pool (spec 008)
// Grupo 2: conjunto de colliders (`collider_set.wgsl`).

@compute @workgroup_size(64)
fn mpm_particle_collision_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let p = gid3.x + gid3.y * nwg.x * 64u;
    if (p >= mpm_params.particle_count || !pool_live(live[p >> 5u], p)) { return; }

    var pos = particles[p].pos.xyz;
    var vel = particles[p].vel.xyz;
    // Contato inelástico: a componente normal entrante é removida (a grade já resolveu o rebote).
    collider_set_push_out(&pos, &vel, 0.0, 0.0);
    particles[p].pos = vec4f(pos, particles[p].pos.w);
    particles[p].vel = vec4f(vel, particles[p].vel.w);
}
