/**
 * NeighborSearchGridLayout — contratos de buffer e parâmetros do hash grid de vizinhos.
 *
 * ## Buffers gerenciados por NeighborSearchGrid
 *
 *   gpu_ns_cell_ids          — u32[N]          célula flat de cada partícula
 *   gpu_ns_cell_count        — u32[N_cells]     contagem de partículas por célula (zerado a cada build)
 *   gpu_ns_cell_start        — u32[N_cells]     prefix scan exclusivo de cell_count (saída do scan)
 *   gpu_ns_cell_cursor       — u32[N_cells]     cópia de cell_start; consumido atomicamente por scatter
 *   gpu_ns_group_sums        — u32[256]         somas de workgroup para o scan de 2 níveis
 *   gpu_ns_sorted_particles  — u32[N]           índices de partícula ordenados por célula
 *   gpu_ns_neighbor_list     — u32[N × maxNb]  lista de vizinhos (zerado antes de ns_find)
 *   gpu_ns_neighbor_count    — u32[N]           número de vizinhos por partícula (zerado antes de ns_find)
 *
 * ## NsSimParams (48 bytes = 3 × vec4)
 *
 *   Offsets em Float32Array / Uint32Array view sobre ArrayBuffer de 48 bytes.
 *   Os campos origin_cell, dims e counts mapeiam para os campos WGSL de mesmo nome.
 *
 * ## Restrição de grid
 *
 *   n_cells ≤ 65536 — limitado pelo scan de 2 níveis (256 workgroups × 256 threads).
 *   Para grades maiores (64³ = 262144), implementar scan de 3 níveis em versão futura.
 */

// ── Strides e tamanhos ─────────────────────────────────────────────────────────

/** Bytes do buffer NsSimParams (uniform). */
export const NS_SIM_PARAMS_BYTES = 48;

/** Número máximo de grupos no scan de 2 níveis. */
export const NS_MAX_SCAN_GROUPS = 256;

// ── Offsets no NsSimParams (Float32Array view, 48 bytes) ──────────────────────
// origin_cell: vec4f  → floats [0,1,2,3]
export const NSP_ORIGIN_X   = 0;
export const NSP_ORIGIN_Y   = 1;
export const NSP_ORIGIN_Z   = 2;
export const NSP_CELL_SIZE  = 3;

// dims: vec4u → uint32 [4,5,6,7]
export const NSP_GRID_X     = 4;
export const NSP_GRID_Y     = 5;
export const NSP_GRID_Z     = 6;
export const NSP_N_CELLS    = 7;

// counts: vec4u → uint32 [8,9,10,11]
export const NSP_PARTICLE_COUNT  = 8;
export const NSP_PARTICLE_STRIDE = 9;   // stride em float32 (não bytes)
export const NSP_MAX_NEIGHBORS   = 10;
export const NSP_PAD             = 11;

// ── Configuração da instância ─────────────────────────────────────────────────

export interface NeighborSearchConfig {
    /** Origem do volume de busca em world space. */
    origin:       [number, number, number];
    /** Raio de suavização h = tamanho de célula (metros). */
    cellSize:     number;
    /** Dimensões da grade em células [x, y, z]. n_cells = x*y*z ≤ 65536. */
    dims:         [number, number, number];
    /** Número máximo de vizinhos por partícula. Default: 64. */
    maxNeighbors?: number;
}

// ── Serialização CPU → GPU ────────────────────────────────────────────────────

/**
 * Escreve NsSimParams em buf (ArrayBuffer de NS_SIM_PARAMS_BYTES bytes).
 */
export function writeNsSimParams(
    buf:            ArrayBuffer,
    config:         NeighborSearchConfig,
    particleCount:  number,
    particleStride: number,   // stride em float32
): void {
    const f32 = new Float32Array(buf);
    const u32 = new Uint32Array(buf);

    const [ox, oy, oz]    = config.origin;
    const [gx, gy, gz]    = config.dims;
    const maxNb = config.maxNeighbors ?? 64;
    const nCells = gx * gy * gz;

    f32[NSP_ORIGIN_X]  = ox;
    f32[NSP_ORIGIN_Y]  = oy;
    f32[NSP_ORIGIN_Z]  = oz;
    f32[NSP_CELL_SIZE] = config.cellSize;

    u32[NSP_GRID_X]    = gx;
    u32[NSP_GRID_Y]    = gy;
    u32[NSP_GRID_Z]    = gz;
    u32[NSP_N_CELLS]   = nCells;

    u32[NSP_PARTICLE_COUNT]  = particleCount;
    u32[NSP_PARTICLE_STRIDE] = particleStride;
    u32[NSP_MAX_NEIGHBORS]   = maxNb;
    u32[NSP_PAD]             = 0;
}
