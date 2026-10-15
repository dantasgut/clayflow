// Colisão das partículas do XPBD com os colliders (spec 010): a posição prevista sai de dentro de cada collider (plano,
// caixa, esfera, superfície) antes da atualização da velocidade — a velocidade vem do deslocamento corrigido. Só é
// despachado com colliders na cena (sem eles, a trajetória é a de antes, bit a bit).
@group(0) @binding(0) var<uniform>             params:    SimParams;
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(2) var<storage, read>       live: array<u32>;  // slots vivos do pool (spec 008)
// Grupo 2: conjunto de colliders (`collider_set.wgsl`).

@compute @workgroup_size(64)
fn xpbd_collide_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    collider_time = params.field_time;
    let i = gid3.x + gid3.y * nwg.x * 64u;
    if (i >= params.particle_count || !pool_live(live[i >> 5u], i)) { return; }
    if (particles[i].pos.w == 0.0) { return; }  // partícula fixada
    var p = particles[i].pred.xyz;
    var v = vec3f(0.0);
    collider_set_push_out(&p, &v, params.particle_radius, 0.0);
    particles[i].pred = vec4f(p, particles[i].pred.w);
}
