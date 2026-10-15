// Colisão dos nós do FEM com os colliders (spec 010): a posição prevista sai de dentro de cada collider (plano, caixa,
// esfera, superfície) antes da atualização da velocidade. Só é despachado com colliders na cena (sem eles, a trajetória
// é a de antes, bit a bit).
@group(0) @binding(0) var<uniform>             fem_params: FEMSimParams;
@group(0) @binding(1) var<storage, read_write> nodes:      array<Particle>;
@group(0) @binding(2) var<storage, read>       live: array<u32>;  // slots vivos do pool (spec 008)
// Grupo 2: conjunto de colliders (`collider_set.wgsl`).

@compute @workgroup_size(64)
fn fem_collide_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    collider_time = fem_params.field_time;
    let i = gid3.x + gid3.y * nwg.x * 64u;
    if (i >= fem_params.node_count || !pool_live(live[i >> 5u], i)) { return; }
    if (nodes[i].pos.w == 0.0) { return; }  // nó fixado
    var p = nodes[i].pred.xyz;
    var v = vec3f(0.0);
    collider_set_push_out(&p, &v, fem_params.collision_radius, 0.0);
    nodes[i].pred = vec4f(p, nodes[i].pred.w);
}
