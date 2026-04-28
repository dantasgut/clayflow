// portado de legacy/elements/physics/gpu/wgsl/structs/mpm_grid_node.wgsl.ts
struct MPMGridNode {
    mass_i32:  atomic<i32>,  // massa × fixed_scale
    mom_x_i32: atomic<i32>,  // momentum.x × fixed_scale
    mom_y_i32: atomic<i32>,  // momentum.y × fixed_scale
    mom_z_i32: atomic<i32>,  // momentum.z × fixed_scale
    vel:       vec3f,        // velocidade normalizada (após grid_update)
    _pad:      f32,          // padding
}
