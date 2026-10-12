// portado de legacy/elements/physics/gpu/wgsl/kernels/pbf_predict.wgsl.ts
@group(0) @binding(0) var<uniform>             pbf_params: PBFSimParams;
@group(1) @binding(0) var<storage, read_write> particles:  array<PBFParticle>;

@compute @workgroup_size(64)
fn pbf_predict_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid = vec3u(gid3.x + gid3.y * nwg.x * 64u, 0u, 0u);
    let i = gid.x;
    if (i >= pbf_params.particle_count) { return; }

    let dt = pbf_params.dt;
    let g  = pbf_params.gravity;

    var p = particles[i];

    // Salva posição anterior ao substep
    p.posOld = p.pos;

    // Semi-implicit Euler: vel first, then pos
    p.vel = vec4f(p.vel.xyz + dt * g, 0.0);
    p.pos = vec4f(p.pos.xyz + dt * p.vel.xyz, p.pos.w);

    particles[i] = p;
}
