/**
 * Struct WGSL: MPMSimParams — parâmetros globais da simulação MPM por substep.
 *
 * Layout: 96 bytes (6 × vec4, alinhamento std140 para uniform buffer).
 *
 *   offset  0: gravity (vec3f) + dt_sub (f32)                      → 16 bytes
 *   offset 16: mu + lambda + fixed_scale + hardening                → 16 bytes
 *   offset 32: theta_c + theta_s + viscosity + dt_frame            → 16 bytes
 *   offset 48: particle_count(u32) + grid_x(u32) + grid_y(u32) + grid_z(u32) → 16 bytes
 *   offset 64: grid_origin (vec3f) + cell_size (f32)               → 16 bytes
 *   offset 80: collider_count(u32) + material_id(u32) + substep_count(u32) + _pad → 16 bytes
 *   Total: 96 bytes
 *
 * Parâmetros de material (Neo-Hookean):
 *   mu     = E / (2*(1+nu))
 *   lambda = E*nu / ((1+nu)*(1-2*nu))
 *
 * fixed_scale: fator de ponto fixo para atomicAdd i32 ≈ 1e6 (2^20).
 * cell_size:   tamanho de célula da grade (dx) em metros.
 * grid_origin: canto mínimo da grade em world space.
 */
export const WGSL_STRUCT_MPM_SIM_PARAMS = /* wgsl */`

struct MPMSimParams {
    gravity:         vec3f,   // gravidade em world space (m/s²)
    dt_sub:          f32,     // passo de tempo do substep

    mu:              f32,     // Lamé shear modulus
    lambda_lame:     f32,     // Lamé bulk modulus
    fixed_scale:     f32,     // fator de ponto fixo para atomic<i32>
    hardening:       f32,     // coeficiente de hardening (snow)

    theta_c:         f32,     // critical compression (snow)
    theta_s:         f32,     // critical stretch (snow)
    viscosity:       f32,     // viscosidade dinâmica (fluid)
    dt_frame:        f32,     // passo de tempo do frame

    particle_count:  u32,     // número total de partículas
    grid_x:          u32,     // dimensão da grade X
    grid_y:          u32,     // dimensão da grade Y
    grid_z:          u32,     // dimensão da grade Z

    grid_origin:     vec3f,   // canto mínimo da grade em world space
    cell_size:       f32,     // tamanho de célula dx (metros)

    collider_count:  u32,     // número de ColliderDesc
    material_id:     u32,     // 0=elastic, 1=snow, 2=fluid, 3=sand
    substep_count:   u32,     // substeps por frame
    inv_dx:          f32,     // 1.0 / cell_size (pré-calculado)
}
`;
