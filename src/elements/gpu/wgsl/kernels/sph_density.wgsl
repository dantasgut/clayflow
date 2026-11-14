// portado de legacy/elements/physics/gpu/wgsl/kernels/sph_density.wgsl.ts

@compute @workgroup_size(WORKGROUP_SIZE)
fn sph_density_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    // Na ordem por célula: o posto `t` (a lista e a contagem de vizinhos) e a partícula `i` dele.
    let t = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let i = neighbor_particle(t, sph_params.particle_count);
    if (i == NONE) { return; }

    let h      = sph_params.h;
    let mass   = sph_params.particle_mass;
    let max_nb = sph_params.max_neighbors;
    let nb_n   = neighbor_count[t];
    let xi     = particles[i].pos.xyz;

    // Auto-contribuição
    var rho = mass * W_cubic(0.0, h);

    for (var k: u32 = 0u; k < nb_n && k < max_nb; k++) {
        let j  = neighbor_list[k * sph_params.neighbor_stride + t];
        let xj = particles[j].pos.xyz;
        let r  = length(xi - xj);
        rho   += mass * W_cubic(r, h);
    }

    // Fronteira sólida (Akinci et al. 2012): o sólido conta como fluido em repouso no volume do núcleo dentro dele.
    rho += sph_params.rest_density * sph_boundary[i].w;

    particles[i].pos.w = rho;
}
