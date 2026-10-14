// portado de legacy/elements/physics/gpu/wgsl/kernels/fem_velocity_update.wgsl.ts
@group(0) @binding(0) var<uniform>             fem_params: FEMSimParams;
@group(0) @binding(1) var<storage, read_write> nodes:      array<Particle>;
@group(0) @binding(2) var<storage, read>       live: array<u32>;  // slots vivos do pool (spec 008)

@compute @workgroup_size(64)
fn fem_velocity_update_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid = vec3u(gid3.x + gid3.y * nwg.x * 64u, 0u, 0u);
    let i = gid.x;
    if (i >= fem_params.node_count || !pool_live(live[i >> 5u], i)) { return; }

    let inv_mass = nodes[i].pos.w;
    if (inv_mass == 0.0) { return; }

    let dt = fem_params.dt_sub;
    if (dt < 1e-12) { return; }

    let pos  = nodes[i].pos.xyz;
    let pred = nodes[i].pred.xyz;

    var vel = (pred - pos) / dt;
    vel *= max(1.0 - fem_params.damping, 0.0);

    nodes[i].vel = vec4f(vel, nodes[i].vel.w);
    nodes[i].pos = vec4f(pred, nodes[i].pos.w);
}
