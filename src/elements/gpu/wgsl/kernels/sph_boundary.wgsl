// Fronteira sólida do SPH (Akinci et al. 2012): por partícula, antes da densidade, o volume do núcleo dentro dos
// sólidos e o gradiente dele (`fluid_boundary`) — lidos pela densidade e pela pressão do mesmo passo —, e o
// sólido mais próximo no registro da partícula (`contact`, lido pelo campo dos fluidos), com o ancoramento da superfície
// física dele em `color.w` (T066d: lido na colisão; as forças e a integração o preservam).
// Grupo 2: conjunto de colliders (`collider_set.wgsl`, `collider_surface.wgsl`); o núcleo da fronteira é a spline cúbica
// (o padrão).

@compute @workgroup_size(WORKGROUP_SIZE)
fn sph_boundary_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    collider_time = sph_params.field_time;
    let gid = vec3u(gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE, 0u, 0u);
    let i = gid.x;
    if (i >= sph_params.particle_count || !pool_live(live[i >> 5u], i)) { return; }
    let b = fluid_boundary(
        particles[i].pos.xyz, sph_params.h, 2.0 * sph_params.h,
        fluid_adhesion_min(sph_params.bound_min, sph_params.open_bounds),
    );
    sph_boundary[i] = b.term;
    particles[i].contact = b.nearest;
    // A superfície do sólido mais próximo: a do collider, ou a padrão (entrada 0) quando é uma parede do domínio.
    let p = particles[i].pos.xyz;
    let lo = fluid_adhesion_min(sph_params.bound_min, sph_params.open_bounds);
    var surface = 0u;
    if (collider_set_distance(p) < min(p.y - lo.y, min(p.x - lo.x, p.z - lo.z))) { surface = collider_set_surface(p); }
    particles[i].color.w = sph_params.wet_pinning[surface / 4u][surface % 4u];
}
