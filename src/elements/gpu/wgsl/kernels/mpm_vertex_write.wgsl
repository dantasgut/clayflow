// portado de legacy/elements/physics/gpu/wgsl/kernels/mpm_vertex_write.wgsl.ts
@group(0) @binding(0) var<uniform>             mpm_params:    MPMSimParams;
@group(2) @binding(0) var<storage, read>       particles:     array<MPMParticle>;
@group(3) @binding(0) var<storage, read_write> vertex_buffer: array<f32>;

const MPM_VERTEX_STRIDE: u32 = 8u;

@compute @workgroup_size(64)
fn mpm_vertex_write_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid = vec3u(gid3.x + gid3.y * nwg.x * 64u, 0u, 0u);
    let i = gid.x;
    if (i >= mpm_params.particle_count) { return; }

    let base = i * MPM_VERTEX_STRIDE;
    let pos  = particles[i].pos.xyz;

    vertex_buffer[base]      = pos.x;
    vertex_buffer[base + 1u] = pos.y;
    vertex_buffer[base + 2u] = pos.z;
    // nx, ny, nz, u, v (3-7) preservados
}
