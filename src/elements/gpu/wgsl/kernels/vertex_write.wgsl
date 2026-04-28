// portado de legacy/elements/physics/gpu/wgsl/kernels/vertex_write.wgsl.ts
@group(0) @binding(0) var<uniform>             params:        SimParams;
@group(0) @binding(1) var<storage, read>       particles:     array<Particle>;
@group(0) @binding(2) var<storage, read_write> vertex_buffer: array<f32>;

const VERTEX_STRIDE: u32 = 8u;  // floats por vértice: x, y, z, nx, ny, nz, u, v

@compute @workgroup_size(64)
fn vertex_write_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= params.particle_count) { return; }

    let base = i * VERTEX_STRIDE;
    let pos  = particles[i].pos.xyz;  // posição commitada após velocity_update

    vertex_buffer[base]     = pos.x;
    vertex_buffer[base + 1u] = pos.y;
    vertex_buffer[base + 2u] = pos.z;
    // nx, ny, nz, u, v (índices 3-7) são preservados — não sobrescritos
}
