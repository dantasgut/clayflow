// portado de legacy/elements/physics/gpu/wgsl/structs/distance_constraint.wgsl.ts
struct DistanceConstraint {
    i:           u32,  // índice partícula A
    j:           u32,  // índice partícula B
    rest_length: f32,  // comprimento de repouso (m)
    compliance:  f32,  // compliance da aresta (m/N)
}
