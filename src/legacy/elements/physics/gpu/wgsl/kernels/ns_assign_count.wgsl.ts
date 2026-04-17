/**
 * Kernel WGSL: ns_assign_count — atribui célula a cada partícula e conta partículas por célula.
 *
 * Para cada partícula i:
 *   1. Lê posição de particle_data[i * stride + {0,1,2}]
 *   2. Calcula índice de célula flat: cell = ix + iy*gx + iz*gx*gy
 *   3. Escreve cell_ids[i] = cell (ou NS_INVALID_CELL se fora do volume)
 *   4. atomicAdd(cell_count[cell], 1) — conta partículas por célula
 *
 * Bind groups:
 *   @group(0) @binding(0) — NsSimParams (uniform)
 *   @group(1) @binding(0) — particle_data: array<f32> (read)
 *   @group(1) @binding(1) — cell_ids: array<u32> (read_write)
 *   @group(2) @binding(0) — cell_count: array<atomic<u32>> (read_write)
 *
 * Dispatch: ceil(particle_count / 64) workgroups.
 */
export const WGSL_KERNEL_NS_ASSIGN_COUNT = /* wgsl */`

const NS_INVALID_CELL: u32 = 0xFFFFFFFFu;

@group(0) @binding(0) var<uniform>             ns_params:    NsSimParams;
@group(1) @binding(0) var<storage, read>       particle_data: array<f32>;
@group(1) @binding(1) var<storage, read_write> cell_ids:      array<u32>;
@group(2) @binding(0) var<storage, read_write> cell_count:    array<atomic<u32>>;

@compute @workgroup_size(64)
fn ns_assign_count_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= ns_params.counts.x) { return; }  // counts.x = particle_count

    let stride = ns_params.counts.y;  // particle_stride_f32
    let px = particle_data[i * stride + 0u];
    let py = particle_data[i * stride + 1u];
    let pz = particle_data[i * stride + 2u];

    let origin    = ns_params.origin_cell.xyz;
    let cell_size = ns_params.origin_cell.w;
    let gx = ns_params.dims.x;
    let gy = ns_params.dims.y;
    let gz = ns_params.dims.z;

    // Coordenadas de célula
    let ix = i32(floor((px - origin.x) / cell_size));
    let iy = i32(floor((py - origin.y) / cell_size));
    let iz = i32(floor((pz - origin.z) / cell_size));

    // Fora do volume → célula inválida (não contribui para o neighbor search)
    if (ix < 0 || iy < 0 || iz < 0
     || u32(ix) >= gx || u32(iy) >= gy || u32(iz) >= gz) {
        cell_ids[i] = NS_INVALID_CELL;
        return;
    }

    let cell = u32(ix) + u32(iy) * gx + u32(iz) * gx * gy;
    cell_ids[i] = cell;
    atomicAdd(&cell_count[cell], 1u);
}
`;
