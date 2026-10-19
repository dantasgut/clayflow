// portado de legacy/elements/physics/gpu/wgsl/kernels/sph_density.wgsl.ts

@compute @workgroup_size(WORKGROUP_SIZE)
fn sph_density_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Na ordem por célula da vizinhança (spec 034): os fios de um grupo são partículas vizinhas e leem os mesmos vizinhos.
    let t = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (t >= ns_order[arrayLength(&ns_order) - 1u]) { return; }
    let i = ns_order[t];
    if (!pool_live(live[i >> 5u], i)) { return; }

    let h      = sph_params.h;
    let mass   = sph_params.particle_mass;
    let max_nb = sph_params.max_neighbors;
    let nb_n   = neighbor_count[i];
    let xi     = particles[i].pos.xyz;

    // Auto-contribuição
    var rho = mass * W_cubic(0.0, h);

    for (var k: u32 = 0u; k < nb_n && k < max_nb; k++) {
        let j  = neighbor_list[k * sph_params.neighbor_stride + i];
        let xj = particles[j].pos.xyz;
        let r  = length(xi - xj);
        rho   += mass * W_cubic(r, h);
    }

    particles[i].pos.w = rho;
}
