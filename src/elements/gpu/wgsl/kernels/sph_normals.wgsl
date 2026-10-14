// Normais de superfície do SPH para a tensão superficial de Akinci (spec 030): nᵢ = H Σⱼ (m/ρⱼ) ∇W(xᵢ − xⱼ), com H = 2h
// (suporte da spline cúbica). No miolo do fluido a soma se anula; na borda aponta para fora. Gravado só com coesão > 0.
@group(0) @binding(0) var<uniform>             sph_params:     SPHSimParams;
@group(1) @binding(0) var<storage, read_write> particles:      array<SPHParticle>;
@group(1) @binding(1) var<storage, read>       live: array<u32>;  // slots vivos do pool (spec 008)
@group(2) @binding(0) var<storage, read>       neighbor_list:  array<u32>;
@group(2) @binding(1) var<storage, read>       neighbor_count: array<u32>;
@group(3) @binding(0) var<storage, read_write> sph_normal:     array<vec4f>;

@compute @workgroup_size(64)
fn sph_normals_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid = vec3u(gid3.x + gid3.y * nwg.x * 64u, 0u, 0u);
    let i = gid.x;
    if (i >= sph_params.particle_count || !pool_live(live[i >> 5u], i)) { return; }

    let h    = sph_params.h;
    let mass = sph_params.particle_mass;
    let xi   = particles[i].pos.xyz;
    let nb_n = neighbor_count[i];

    var n = vec3f(0.0);
    for (var k: u32 = 0u; k < nb_n && k < sph_params.max_neighbors; k++) {
        let j     = neighbor_list[k * sph_params.neighbor_stride + i];
        let rho_j = particles[j].pos.w;
        if (rho_j <= 0.001) { continue; }
        let r_vec = xi - particles[j].pos.xyz;
        n += (mass / rho_j) * grad_W_cubic(r_vec, length(r_vec), h);
    }
    sph_normal[i] = vec4f(sph_params.support * n, 0.0);
}
