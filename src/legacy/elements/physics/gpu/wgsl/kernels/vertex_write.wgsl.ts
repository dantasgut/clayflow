/**
 * Kernel WGSL: VertexWrite — escreve posições de partículas no vertex buffer.
 *
 * Replica SoftBodySyncStage.execute() na GPU.
 * Copia particles[i].pos.xyz para o vertex buffer com stride 8 floats
 * (x, y, z, nx, ny, nz, u, v), escrevendo apenas os primeiros 3 floats por vértice.
 *
 * Executado uma única vez por frame, após todos os substeps,
 * antes do render pass — o renderer lê o vertex buffer atualizado diretamente.
 *
 * Normais e UVs não são atualizados — extensão futura (recalcular normais na GPU).
 *
 * Bind groups:
 *   @group(0) @binding(0) — SimParams        (uniform)
 *   @group(0) @binding(1) — Particle[]       (storage read)
 *   @group(0) @binding(2) — array<f32>       (storage read_write — vertex buffer)
 *
 * Dispatch: ceil(particle_count / 64) workgroups.
 *
 * Depende de: SimParams, Particle.
 */
export const WGSL_KERNEL_VERTEX_WRITE = /* wgsl */`

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
`;
