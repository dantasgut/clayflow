// portado de legacy/elements/physics/gpu/wgsl/structs/sim_params.wgsl.ts
struct SimParams {
    gravity:          vec3f,  // gravidade em world space (ex: 0, -9.81, 0)
    dt:               f32,    // passo de tempo do substep (dt_frame / substeps)
    restitution:      f32,    // coeficiente de restituição na colisão partícula-SDF
    damping:          f32,    // fator de amortecimento por substep
    particle_radius:  f32,    // raio de colisão das partículas (metres)
    particle_count:   u32,    // número total de partículas no buffer
    constraint_count: u32,    // número total de constraints no buffer
    collider_count:   u32,    // número de ColliderDesc no buffer
    shape_stiffness:  f32,    // coeficiente de Shape Matching [0..1]; 0 = inativo
    collision_radius: f32,    // raio de contato com colliders externos (0 = superfície exata)
}
