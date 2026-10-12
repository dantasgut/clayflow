// portado de legacy/elements/physics/gpu/wgsl/kernels/sph_integrate.wgsl.ts
@group(0) @binding(0) var<uniform>             sph_params: SPHSimParams;
@group(1) @binding(0) var<storage, read_write> particles:  array<SPHParticle>;

@compute @workgroup_size(64)
fn sph_integrate_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid = vec3u(gid3.x + gid3.y * nwg.x * 64u, 0u, 0u);
    let i = gid.x;
    if (i >= sph_params.particle_count) { return; }

    let dt = sph_params.dt;

    var vel = particles[i].vel.xyz;
    let acc = particles[i].force.xyz;
    let xsph = particles[i].color.xyz;

    vel += dt * acc + xsph;
    let pos = particles[i].pos.xyz + dt * vel;

    particles[i].vel = vec4f(vel, particles[i].vel.w);
    particles[i].pos = vec4f(pos, particles[i].pos.w);

    // Zera força acumulada para próximo substep
    particles[i].force = vec4f(0.0);
    particles[i].color = vec4f(0.0);
}
