// portado de legacy/elements/physics/gpu/wgsl/kernels/mpm_vertex_write.wgsl.ts
@group(0) @binding(0) var<uniform>             mpm_params:    MPMSimParams;
@group(2) @binding(0) var<storage, read>       particles:     array<MPMParticle>;
@group(3) @binding(0) var<storage, read_write> vertex_buffer: array<f32>;

const MPM_VERTEX_STRIDE: u32 = 8u;

@compute @workgroup_size(64)
fn mpm_vertex_write_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= mpm_params.particle_count) { return; }

    let base = i * MPM_VERTEX_STRIDE;
    let pos  = particles[i].pos.xyz;

    vertex_buffer[base]      = pos.x;
    vertex_buffer[base + 1u] = pos.y;
    vertex_buffer[base + 2u] = pos.z;
    // nx, ny, nz, u, v (3-7) preservados
}
