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

    // ── Adesão às fronteiras (spec 030): só com adesão > 0, antes do empurrão para fora ─────────────────────────────
    if (sph_params.adhesion_accel > 0.0) {
        collider_set_adhesion(
            pos, &vel, sph_params.support, sph_params.adhesion_accel, sph_params.adhesion_tangential,
            sph_params.dt, fluid_adhesion_min(bound_min, sph_params.open_bounds),
        );
    }

    // ── Bounds AABB (piso + laterais); domínio aberto: quem sai da caixa é retirado (spec 010) ───────────────────
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
    if (sph_params.wet_neighbors > 0u && neighbor_count[t] < sph_params.wet_neighbors) {
        vel = fluid_wet_pinning(
            vel, particles[i].contact, 1.5 * sph_params.collision_radius, sph_params.wet_pinning, sph_params.dt,
        );
    }

    particles[i].pos = vec4f(pos, particles[i].pos.w);
    particles[i].vel = vec4f(vel, particles[i].vel.w);
}
