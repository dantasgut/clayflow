/**
 * Kernel WGSL: ns_scatter — ordena partículas por célula.
 *
 * Para cada partícula i:
 *   1. Lê cell = cell_ids[i]
 *   2. Se inválida (NS_INVALID_CELL), ignora
 *   3. Obtém posição em sorted: pos = atomicAdd(cell_cursor[cell], 1)
 *   4. sorted_particles[pos] = i
 *
 * cell_cursor deve ser inicializado com uma cópia de cell_start antes do dispatch
 * (via encoder.copyBufferToBuffer(cell_start, cell_cursor)).
 *
 * Bind groups:
 *   @group(0) @binding(0) — NsSimParams (uniform)
 *   @group(1) @binding(0) — cell_ids: array<u32> (read)
 *   @group(1) @binding(1) — cell_cursor: array<atomic<u32>> (read_write)
 *   @group(1) @binding(2) — sorted_particles: array<u32> (read_write)
 *
 * Dispatch: ceil(particle_count / 64) workgroups.
 */
export const WGSL_KERNEL_NS_SCATTER = /* wgsl */`

@group(0) @binding(0) var<uniform>             ns_params:        NsSimParams;
@group(1) @binding(0) var<storage, read>       cell_ids:         array<u32>;
@group(1) @binding(1) var<storage, read_write> cell_cursor:      array<atomic<u32>>;
@group(1) @binding(2) var<storage, read_write> sorted_particles: array<u32>;

@compute @workgroup_size(64)
fn ns_scatter_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= ns_params.counts.x) { return; }  // particle_count

    let cell = cell_ids[i];
    if (cell == 0xFFFFFFFFu) { return; }  // NS_INVALID_CELL

    let pos = atomicAdd(&cell_cursor[cell], 1u);
    sorted_particles[pos] = i;
}
`;
