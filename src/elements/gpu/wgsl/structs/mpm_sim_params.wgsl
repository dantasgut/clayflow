// portado de legacy/elements/physics/gpu/wgsl/structs/mpm_sim_params.wgsl.ts
struct MPMSimParams {
    gravity:         vec3f,   // gravidade em world space (m/s²)
    dt_sub:          f32,     // passo de tempo do substep

    mu:              f32,     // Lamé shear modulus
    lambda_lame:     f32,     // Lamé bulk modulus
    fixed_scale:     f32,     // fator de ponto fixo para atomic<i32>
    particle_mass:   f32,     // massa da partícula ρ₀s³ (ParticleMaterial)

    particle_volume: f32,     // volume de repouso da partícula s³ (ParticleMaterial)
    bulk_modulus:    f32,     // K = ρ₀c² do fluido (ParticleMaterial)
    viscosity:       f32,     // viscosidade dinâmica (fluid)
    dt_frame:        f32,     // passo de tempo do frame

    particle_count:  u32,     // número total de partículas
    grid_x:          u32,     // dimensão da grade X
    grid_y:          u32,     // dimensão da grade Y
    grid_z:          u32,     // dimensão da grade Z

    grid_origin:     vec3f,   // canto mínimo da grade em world space
    cell_size:       f32,     // tamanho de célula dx (metros)

    _reserved0:      u32,
    material_id:     u32,     // MPM_MATERIAL_ELASTIC (0) ou MPM_MATERIAL_FLUID (2)
    substep_count:   u32,     // substeps por frame
    inv_dx:          f32,     // 1.0 / cell_size (pré-calculado)
}

const MPM_MATERIAL_ELASTIC: u32 = 0u;
const MPM_MATERIAL_FLUID:   u32 = 2u;
