/**
 * Kernel WGSL: mpm_vertex_write — escreve posições de partículas MPM no vertex buffer.
 *
 * Executa 1× por frame após todos os substeps, antes do render pass.
 * Stride 8 floats (x, y, z, nx, ny, nz, u, v) — escreve apenas xyz.
 *
 * Bind groups:
 *   @group(0) @binding(0) — MPMSimParams     (uniform)
 *   @group(2) @binding(0) — MPMParticle[]    (storage read)
 *   @group(3) @binding(0) — array<f32>       (storage read_write — vertex buffer)
 *
 * Dispatch: ceil(particle_count / 64) workgroups.
 *
 * Depende de: MPMSimParams, MPMParticle.
 */
export const WGSL_KERNEL_MPM_VERTEX_WRITE = /* wgsl */`

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
`;
