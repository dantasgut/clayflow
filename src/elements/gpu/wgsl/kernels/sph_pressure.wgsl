// portado de legacy/elements/physics/gpu/wgsl/kernels/sph_pressure.wgsl.ts
@group(0) @binding(0) var<uniform>             sph_params: SPHSimParams;
@group(1) @binding(0) var<storage, read_write> particles:  array<SPHParticle>;

@compute @workgroup_size(64)
fn sph_pressure_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid = vec3u(gid3.x + gid3.y * nwg.x * 64u, 0u, 0u);
    let i = gid.x;
    if (i >= sph_params.particle_count) { return; }

    let rho0 = sph_params.rest_density;
    let k0   = sph_params.stiffness;
    let gam  = sph_params.gamma;
    let rho  = particles[i].pos.w;

    let ratio = rho / rho0;
    let p = k0 * (pow(ratio, gam) - 1.0);

    // Clamp negativo: WCSPH pode gerar tensão → ignorar
    particles[i].vel.w = max(p, 0.0);
}
