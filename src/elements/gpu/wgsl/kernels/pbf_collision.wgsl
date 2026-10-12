// portado de legacy/elements/physics/gpu/wgsl/kernels/pbf_collision.wgsl.ts
@group(0) @binding(0) var<uniform>             pbf_params: PBFSimParams;
@group(1) @binding(0) var<storage, read_write> particles:  array<PBFParticle>;
// Grupo 2: conjunto de colliders (`collider_set.wgsl`).

@compute @workgroup_size(64)
fn pbf_collision_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid = vec3u(gid3.x + gid3.y * nwg.x * 64u, 0u, 0u);
    let i = gid.x;
    if (i >= pbf_params.counts.x) { return; }

    let restitution    = pbf_params.bounds.w;
    let bound_min      = pbf_params.bounds.xyz;

    var pos = particles[i].pos.xyz;
    var vel = particles[i].vel.xyz;

    // ── Bounds AABB ───────────────────────────────────────────────────────────
    // Usa bound_min como piso e assume domínio simétrico em y (apenas piso)
    if (pos.y < bound_min.y) {
        pos.y = bound_min.y;
        vel.y = max(0.0, vel.y * -restitution);
    }
    if (pos.x < bound_min.x) { pos.x = bound_min.x; vel.x = abs(vel.x) * restitution; }
    if (pos.z < bound_min.z) { pos.z = bound_min.z; vel.z = abs(vel.z) * restitution; }

    // ── Colliders (pools tipados; pose pelo corpo dono) ──────────────────────
    // Partícula como esfera de raio s/2 (ocupa o próprio espaçamento).
    collider_set_push_out(&pos, &vel, pbf_params.mass.z, restitution);

    particles[i].pos = vec4f(pos, particles[i].pos.w);
    particles[i].vel = vec4f(vel, 0.0);
}
