// portado de legacy/elements/physics/gpu/wgsl/kernels/fem_predict.wgsl.ts
@group(0) @binding(0) var<uniform>             fem_params: FEMSimParams;
@group(0) @binding(1) var<storage, read_write> nodes:      array<Particle>;

@compute @workgroup_size(64)
fn fem_predict_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= fem_params.node_count) { return; }

    let inv_mass = nodes[i].pos.w;
    if (inv_mass == 0.0) {
        // Nó fixo — pred permanece na posição atual
        nodes[i].pred = vec4f(nodes[i].pos.xyz, nodes[i].pred.w);
        return;
    }

    let dt  = fem_params.dt_sub;
    let vel = nodes[i].vel.xyz + fem_params.gravity * dt;
    let pos = nodes[i].pos.xyz;

    nodes[i].vel  = vec4f(vel, nodes[i].vel.w);
    nodes[i].pred = vec4f(pos + vel * dt, nodes[i].pred.w);
}
