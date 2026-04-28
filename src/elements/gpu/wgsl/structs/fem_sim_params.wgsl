// portado de legacy/elements/physics/gpu/wgsl/structs/fem_sim_params.wgsl.ts
struct FEMSimParams {
    gravity:          vec3f,  // gravidade em world space (m/s²)
    dt_sub:           f32,    // passo de tempo do substep (dt_frame / substeps)
    mu:               f32,    // módulo de cisalhamento de Lamé
    lambda:           f32,    // módulo de bulk de Lamé
    damping:          f32,    // fator de amortecimento de velocidade por substep [0..1]
    collision_radius: f32,    // raio de contato com colliders (0 = superfície exata)
    alpha_h:          f32,    // compliance hidrostático = 1/(lambda + 2*mu)
    alpha_d:          f32,    // compliance desviador    = 1/mu
    dt_frame:         f32,    // passo de tempo do frame completo
    restitution:      f32,    // coeficiente de restituição na colisão nó-SDF
    collider_count:   u32,    // número de ColliderDesc no buffer
    node_count:       u32,    // número total de nós (partículas) do mesh
    elem_count:       u32,    // número total de elementos tetraédricos
    solve_iters:      u32,    // iterações de solve por substep (para serial fallback)
    rb_count:         u32,    // número de RigidBody no buffer global
    _fsp_pad1:        u32,
    _fsp_pad2:        u32,
    _fsp_pad3:        u32,
}
