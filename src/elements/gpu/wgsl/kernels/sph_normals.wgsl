// Normais de superfície do SPH para a tensão superficial de Akinci (spec 030): nᵢ = H Σⱼ (m/ρ₀) ∇W(xᵢ − xⱼ), com H = 2h
// (suporte da spline cúbica). No miolo do fluido a soma se anula; na borda aponta para fora. O volume é o de repouso
// (m/ρ₀), não m/ρⱼ: numa partícula solta ρⱼ cai à auto-contribuição e a normal explodiria. Gravado só com coesão > 0.

@compute @workgroup_size(WORKGROUP_SIZE)
fn sph_normals_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Na ordem por célula da vizinhança (spec 034): os fios de um grupo são partículas vizinhas e leem os mesmos vizinhos.
    let t = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (t >= ns_order[arrayLength(&ns_order) - 1u]) { return; }
    let i = ns_order[t];
    if (!pool_live(live[i >> 5u], i)) { return; }

    let h    = sph_params.h;
    let volume = sph_params.particle_mass / sph_params.rest_density;
    let xi   = particles[i].pos.xyz;
    let nb_n = neighbor_count[i];

    var n = vec3f(0.0);
    for (var k: u32 = 0u; k < nb_n && k < sph_params.max_neighbors; k++) {
        let j     = neighbor_list[k * sph_params.neighbor_stride + i];
        let r_vec = xi - particles[j].pos.xyz;
        n += grad_W_cubic(r_vec, length(r_vec), h);
    }
    sph_normal[i] = vec4f(sph_params.support * volume * n, 0.0);
}
