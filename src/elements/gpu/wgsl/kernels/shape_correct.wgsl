// portado de legacy/elements/physics/gpu/wgsl/kernels/shape_correct.wgsl.ts
@group(0) @binding(0) var<uniform>             params:         SimParams;
@group(0) @binding(1) var<storage, read_write> particles:      array<Particle>;
@group(0) @binding(2) var<storage, read>       goal_positions: array<vec4f>;

@compute @workgroup_size(64)
fn shape_correct_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= params.particle_count) { return; }
    if (particles[i].pos.w == 0.0) { return; }   // partícula fixada — sem correção

    let alpha = params.shape_stiffness;
    let g_i   = goal_positions[i].xyz;
    let p_i   = particles[i].pred.xyz;
    particles[i].pred = vec4f(p_i + alpha * (g_i - p_i), particles[i].pred.w);
}
