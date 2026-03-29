/**
 * Kernel WGSL: fem_vertex_write — escreve posições dos nós FEM no vertex buffer.
 *
 * Executa 1× por frame, APÓS todos os substeps, antes do render pass.
 * Copia nodes[i].pos.xyz para o vertex buffer com stride 8 floats
 * (x, y, z, nx, ny, nz, u, v), escrevendo apenas os primeiros 3 floats por vértice.
 *
 * Normais e UVs são preservados — recálculo de normais na GPU é extensão futura.
 *
 * Bind groups:
 *   @group(0) @binding(0) — FEMSimParams     (uniform)
 *   @group(0) @binding(1) — Particle[]       (storage read) — nós
 *   @group(0) @binding(2) — array<f32>       (storage read_write — vertex buffer)
 *
 * Dispatch: ceil(node_count / 64) workgroups.
 *
 * Depende de: FEMSimParams, Particle.
 */
export const WGSL_KERNEL_FEM_VERTEX_WRITE = /* wgsl */`

@group(0) @binding(0) var<uniform>             fem_params:    FEMSimParams;
@group(0) @binding(1) var<storage, read>       nodes:         array<Particle>;
@group(0) @binding(2) var<storage, read_write> vertex_buffer: array<f32>;

const FEM_VERTEX_STRIDE: u32 = 8u;  // floats por vértice: x, y, z, nx, ny, nz, u, v

@compute @workgroup_size(64)
fn fem_vertex_write_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= fem_params.node_count) { return; }

    let base = i * FEM_VERTEX_STRIDE;
    let pos  = nodes[i].pos.xyz;

    vertex_buffer[base]      = pos.x;
    vertex_buffer[base + 1u] = pos.y;
    vertex_buffer[base + 2u] = pos.z;
    // nx, ny, nz, u, v (índices 3-7) são preservados — não sobrescritos
}
`;
