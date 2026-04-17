/**
 * Struct WGSL: NsSimParams — parâmetros de simulação para o Neighbor Search Grid.
 *
 * Layout: 48 bytes (3 × vec4).
 *
 *   origin_cell: vec4f — xyz = origem da grade em world space; w = cell_size (raio de suavização h)
 *   dims:        vec4u — x/y/z = dimensões da grade em células; w = n_cells total
 *   counts:      vec4u — x = particle_count; y = particle_stride (em f32); z = max_neighbors; w = _pad
 *
 * ## Relação com NsSimParams TypeScript (NeighborSearchGridLayout)
 *
 * A escrita é feita via Float32Array / Uint32Array sobre um ArrayBuffer de 48 bytes.
 * Offsets exportados em NeighborSearchGridLayout.ts como NSP_*.
 */
export const WGSL_STRUCT_NS_SIM_PARAMS = /* wgsl */`

struct NsSimParams {
    origin_cell: vec4f,   // xyz = grid origin world; w = cell_size (h)
    dims:        vec4u,   // xyz = grid dims in cells; w = n_cells
    counts:      vec4u,   // x = particle_count; y = particle_stride_f32; z = max_neighbors; w = pad
}
`;
