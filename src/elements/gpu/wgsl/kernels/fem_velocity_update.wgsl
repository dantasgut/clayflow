// portado de legacy/elements/physics/gpu/wgsl/kernels/fem_velocity_update.wgsl.ts
@group(0) @binding(0) var<uniform>             fem_params: FEMSimParams;
@group(0) @binding(1) var<storage, read_write> nodes:      array<Particle>;

@compute @workgroup_size(64)
fn fem_velocity_update_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= fem_params.node_count) { return; }

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
