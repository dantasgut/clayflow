// portado de legacy/elements/physics/gpu/wgsl/kernels/sph_density.wgsl.ts
@group(0) @binding(0) var<uniform>             sph_params:     SPHSimParams;
@group(1) @binding(0) var<storage, read_write> particles:      array<SPHParticle>;
@group(2) @binding(0) var<storage, read>       neighbor_list:  array<u32>;
@group(2) @binding(1) var<storage, read>       neighbor_count: array<u32>;

@compute @workgroup_size(64)
fn sph_density_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= sph_params.counts.x) { return; }

    let h      = sph_params.fluid.y;
    let mass   = sph_params.mass.x;
    let max_nb = sph_params.counts.z;
    let nb_n   = neighbor_count[i];
    let xi     = particles[i].pos.xyz;

    // Auto-contribuição
    var rho = mass * W_cubic(0.0, h);

    for (var k: u32 = 0u; k < nb_n && k < max_nb; k++) {
        let j  = neighbor_list[i * max_nb + k];
        let xj = particles[j].pos.xyz;
        let r  = length(xi - xj);
        rho   += mass * W_cubic(r, h);
    }

    particles[i].pos.w = rho;
}
