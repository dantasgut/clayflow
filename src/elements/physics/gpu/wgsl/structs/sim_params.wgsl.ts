/**
 * Struct WGSL: SimParams — parâmetros globais de simulação por substep.
 *
 * Layout: 48 bytes (múltiplo de 16 para uniform buffer — std140).
 *
 *   offset  0: gravity (vec3f, align=16, size=12) + dt (f32) → 16 bytes
 *   offset 16: restitution + damping + particle_radius + particle_count → 16 bytes
 *   offset 32: constraint_count + collider_count + shape_stiffness + collision_radius → 16 bytes
 *   Total: 48 bytes
 *
 * Escrito pela CPU (GpuParticleSimPipeline) uma vez por substep antes dos dispatches.
 * Lido por todos os kernels de física via @group(0) @binding(0).
 */
export const WGSL_STRUCT_SIM_PARAMS = /* wgsl */`

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
`;
