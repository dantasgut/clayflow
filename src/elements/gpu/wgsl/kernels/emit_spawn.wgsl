// Criação de partículas de um emissor num passo (spec 009): cada invocação cria uma partícula no anel — slot
// (head + k) mod capacidade, índice global emitted + k — pela função `emit_fn` (pronta: a forma do emissor). Partícula
// com valor não finito não é criada (o slot fica morto).
// Requer: structs EmitterParams, ComputeParticle, EmitFnRecord; emit_point_types; emit_fn (ponto).

@group(0) @binding(0) var<uniform>             emit_params:     EmitterParams;
@group(0) @binding(1) var<storage, read_write> emit_particles:  array<ComputeParticle>;
@group(0) @binding(2) var<storage, read>       emit_fn_records: array<EmitFnRecord>;

fn emit_finite(v: vec4f) -> bool {
    return all(v == v) && all(abs(v) < vec4f(3.4e38));
}

@compute @workgroup_size(64)
fn emit_spawn_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let k = gid3.x + gid3.y * nwg.x * 64u;
    if (k >= emit_params.spawn_count) { return; }
    let slot = (emit_params.head + k) % emit_params.capacity;
    let data = emit_fn_params(emit_fn_records[emit_params.record_slot]);
    let p = emit_fn(emit_params.emitted + k, emit_params.time, emit_params.seed, data);
    var q: ComputeParticle;
    let ok = emit_finite(vec4f(p.position, p.life)) && emit_finite(vec4f(p.velocity, 0.0))
        && emit_finite(p.color) && p.life > 0.0;
    q.position = vec4f(p.position, 1.0);
    q.velocity = vec4f(p.velocity, 0.0);
    q.ageAndLife = vec4f(0.0, select(0.0, p.life, ok), 0.0, 0.0);
    q.params = p.color;
    emit_particles[slot] = q;
}
