// portado de legacy/elements/physics/gpu/wgsl/kernels/pbf_collision.wgsl.ts
// Grupo 2: conjunto de colliders (`collider_set.wgsl`).

@compute @workgroup_size(WORKGROUP_SIZE)
fn pbf_collision_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Tempo da iteração: escolhe a cópia do passo nos colliders de superfície (spec 010).
    collider_time = pbf_params.field_time;
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid = vec3u(gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE, 0u, 0u);
    let i = gid.x;
    if (i >= pbf_params.particle_count || !pool_live(live[i >> 5u], i)) { return; }

    let restitution    = pbf_params.restitution;
    let bound_min      = pbf_params.bound_min;

    var pos = particles[i].pos.xyz;
    var vel = particles[i].vel.xyz;

    // ── Bounds AABB ───────────────────────────────────────────────────────────
    // Usa bound_min como piso e assume domínio simétrico em y (apenas piso)
    if (pbf_params.open_bounds != 0u) {
        // Domínio aberto (spec 010): quem sai da caixa é retirado.
        if (fluid_outside(pos, bound_min, pbf_params.bound_max)) {
            particles[i].pos = vec4f(pos.x, FLUID_RETIRED_Y, pos.z, particles[i].pos.w);
            // A velocidade sai de (pos − posOld)/dt: a posição anterior vai junto, parada.
            particles[i].posOld = vec4f(pos.x, FLUID_RETIRED_Y, pos.z, particles[i].posOld.w);
            particles[i].vel = vec4f(0.0);
            return;
        }
    } else {
        if (pos.y < bound_min.y) {
            pos.y = bound_min.y;
            vel.y = max(0.0, vel.y * -restitution);
        }
        if (pos.x < bound_min.x) { pos.x = bound_min.x; vel.x = abs(vel.x) * restitution; }
        if (pos.z < bound_min.z) { pos.z = bound_min.z; vel.z = abs(vel.z) * restitution; }
    }

    // ── Colliders (pools tipados; pose pelo corpo dono) ──────────────────────
    // Partícula como esfera de raio s/2 (ocupa o próprio espaçamento). Colisão contínua desde o início do passo
    // (`posOld`): o passo do PBF é longo, e a partícula rápida atravessaria um sólido fino (spec 034).
    pos = collider_set_sweep(particles[i].posOld.xyz, pos, pbf_params.collision_radius);
    collider_set_push_out(&pos, &vel, pbf_params.collision_radius, restitution);

    particles[i].pos = vec4f(pos, particles[i].pos.w);
    particles[i].vel = vec4f(vel, 0.0);
}
