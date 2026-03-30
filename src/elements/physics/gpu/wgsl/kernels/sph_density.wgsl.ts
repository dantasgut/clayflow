/**
 * Kernel WGSL: sph_density — computa densidade ρᵢ via SPH.
 *
 * ρᵢ = Σⱼ mⱼ · W₃(|xᵢ − xⱼ|, h)
 *
 * Escreve ρᵢ em particles[i].pos.w
 *
 * Bind groups:
 *   @group(0) @binding(0) — SPHSimParams (uniform)
 *   @group(1) @binding(0) — particles: array<SPHParticle> (read_write)
 *   @group(2) @binding(0) — neighbor_list:  array<u32>
 *   @group(2) @binding(1) — neighbor_count: array<u32>
 *
 * Dispatch: ceil(particle_count / 64)
 */
export const WGSL_KERNEL_SPH_DENSITY = /* wgsl */`

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
`;
