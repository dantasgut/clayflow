// portado de legacy/elements/physics/gpu/wgsl/kernels/sph_collision.wgsl.ts
// Grupo 2: conjunto de colliders (`collider_set.wgsl`).

@compute @workgroup_size(WORKGROUP_SIZE)
fn sph_collision_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Tempo da iteração: escolhe a cópia do passo nos colliders de superfície (spec 010).
    collider_time = sph_params.field_time;
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    // Na ordem por célula: o posto `t` (a lista e a contagem de vizinhos) e a partícula `i` dele.
    let t = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let i = neighbor_particle(t, sph_params.particle_count);
    if (i == NONE) { return; }

    let restitution    = sph_params.restitution;
    let bound_min      = sph_params.bound_min;

    var pos = particles[i].pos.xyz;
    var vel = particles[i].vel.xyz;

    // ── Adesão às fronteiras (spec 030): só com adesão > 0, antes do empurrão para fora. Com tensão superficial, só o
    // arrasto tangencial: a molhagem da borda resolvida vem do ângulo de contato e a força normal fica com a não
    // resolvida, no passe das forças (T066e) ─────────────────────────────────────────────────────────────────────────
    if (sph_params.adhesion_tangential > 0.0) {
        let normal_accel = select(sph_params.adhesion_accel, 0.0, sph_params.surface_tension > 0.0);
        collider_set_adhesion(
            pos, &vel, sph_params.support, normal_accel, sph_params.adhesion_tangential,
            sph_params.dt, fluid_adhesion_min(bound_min, sph_params.open_bounds),
        );
    }

    // ── Bounds AABB (piso + laterais); domínio aberto: quem sai da caixa é retirado (spec 010) ───────────────────
    // A retirada segue retirada (também com as paredes: a gota que virou película, T066d).
    if (fluid_retired(pos)) {
        particles[i].pos = vec4f(pos.x, FLUID_RETIRED_Y, pos.z, particles[i].pos.w);
        particles[i].vel = vec4f(0.0, 0.0, 0.0, particles[i].vel.w);
        return;
    }
    if (sph_params.open_bounds != 0u) {
        if (fluid_outside(pos, bound_min, sph_params.bound_max)) {
            particles[i].pos = vec4f(pos.x, FLUID_RETIRED_Y, pos.z, particles[i].pos.w);
            particles[i].vel = vec4f(0.0, 0.0, 0.0, particles[i].vel.w);
            return;
        }
    } else {
        if (pos.y < bound_min.y) { pos.y = bound_min.y; vel.y = max(0.0, vel.y * -restitution); }
        if (pos.x < bound_min.x) { pos.x = bound_min.x; vel.x = abs(vel.x) * restitution; }
        if (pos.z < bound_min.z) { pos.z = bound_min.z; vel.z = abs(vel.z) * restitution; }
    }

    // ── Colliders (pools tipados; pose pelo corpo dono) ──────────────────────
    // Partícula como esfera de raio s/2 (ocupa o próprio espaçamento).
    collider_set_push_out(&pos, &vel, sph_params.collision_radius, restitution);

    // ── Gota solta (spec 034): a borda ancorada num sólido que a água molha (`fluid_wet_pinning`); com outra água por
    // perto (vizinhas), volta à dinâmica do volume. O contato é o sólido mais próximo do início do passo.
    if (fluid_loose_drop(neighbor_count[t], sph_params.wet_neighbors, particles[i].contact, sph_params.support)) {
        // O ancoramento da superfície do sólido do contato, que a fronteira gravou em `color.w` (T066d).
        let reach = 1.5 * sph_params.collision_radius;
        vel = fluid_wet_pinning(vel, particles[i].contact, reach, particles[i].color.w, sph_params.dt);
        // A que o ancoramento não parou fica marcada (`fluid_drop_state`): o campo dos fluidos a passa à película.
        particles[i].color.w = fluid_drop_state(
            vel, sph_params.gravity, particles[i].contact, reach, particles[i].color.w,
        );
    }

    particles[i].pos = vec4f(pos, particles[i].pos.w);
    particles[i].vel = vec4f(vel, particles[i].vel.w);
}
