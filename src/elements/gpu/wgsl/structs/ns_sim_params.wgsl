// portado de legacy/elements/physics/gpu/wgsl/structs/ns_sim_params.wgsl.ts
struct NsSimParams {
    origin_cell: vec4f,   // xyz = grid origin world; w = cell_size (h)
    dims:        vec4u,   // xyz = grid dims in cells; w = n_cells
    counts:      vec4u,   // x = particle_count; y = particle_stride_f32; z = max_neighbors; w = pad
}
