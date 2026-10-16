// Colisão das partículas de um emissor com os colliders (spec 010), depois do passo (`emit_update`): a partícula viva
// sai de dentro de cada collider (plano, caixa, esfera, superfície), a velocidade normal entrante é refletida com
// restituição e o vértice da nuvem acompanha. Só é despachado com colliders na cena.
// Requer: structs EmitterParams, ComputeParticle; collider_set; recursos `emit_params`,
// `emit_particles`, `emit_vertices`.

const EMIT_RESTITUTION: f32 = 0.3;

@compute @workgroup_size(WORKGROUP_SIZE)
fn emit_collide_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    collider_time = emit_params.time;
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= emit_params.capacity) { return; }
    var q = emit_particles[i];
    if (q.ageAndLife.y <= 0.0) { return; }
    var p = q.position.xyz;
    var v = q.velocity.xyz;
    collider_set_push_out(&p, &v, 0.0, EMIT_RESTITUTION);
    q.position = vec4f(p, q.position.w);
    q.velocity = vec4f(v, q.velocity.w);
    emit_particles[i] = q;
    let o = i;
    emit_vertices[o].px = p.x;
    emit_vertices[o].py = p.y;
    emit_vertices[o].pz = p.z;
}
