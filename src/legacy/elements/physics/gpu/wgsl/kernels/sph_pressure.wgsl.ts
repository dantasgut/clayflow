/**
 * Kernel WGSL: sph_pressure — equação de estado WCSPH.
 *
 * pᵢ = k₀ · [(ρᵢ/ρ₀)^γ − 1],   γ = 7
 *
 * Escreve pᵢ em particles[i].vel.w (pressão)
 *
 * Bind groups:
 *   @group(0) @binding(0) — SPHSimParams (uniform)
 *   @group(1) @binding(0) — particles: array<SPHParticle> (read_write)
 *
 * Dispatch: ceil(particle_count / 64)
 */
export const WGSL_KERNEL_SPH_PRESSURE = /* wgsl */`

@group(0) @binding(0) var<uniform>             sph_params: SPHSimParams;
@group(1) @binding(0) var<storage, read_write> particles:  array<SPHParticle>;

@compute @workgroup_size(64)
fn sph_pressure_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= sph_params.counts.x) { return; }

    let rho0 = sph_params.fluid.x;
    let k0   = sph_params.fluid.z;
    let gam  = sph_params.fluid.w;
    let rho  = particles[i].pos.w;

    let ratio = rho / rho0;
    let p = k0 * (pow(ratio, gam) - 1.0);

    // Clamp negativo: WCSPH pode gerar tensão → ignorar
    particles[i].vel.w = max(p, 0.0);
}
`;
