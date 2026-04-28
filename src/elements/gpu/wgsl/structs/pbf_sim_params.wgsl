// portado de legacy/elements/physics/gpu/wgsl/structs/pbf_sim_params.wgsl.ts
struct PBFSimParams {
    gravity_dt: vec4f,   // xyz=gravidade, w=dt_sub
    config:     vec4f,   // x=rest_density, y=h, z=epsilon, w=s_corr_k
    config2:    vec4f,   // x=s_corr_n(u32), y=vorticity_eps, z=xsph_c, w=dt_frame
    counts:     vec4u,   // x=particle_count, y=collider_count, z=max_neighbors, w=particle_stride_f32
    bounds:     vec4f,   // xyz=aabb_min, w=restitution
}
