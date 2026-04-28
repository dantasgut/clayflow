// portado de legacy/elements/physics/gpu/wgsl/kernels/sph_pressure.wgsl.ts
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
