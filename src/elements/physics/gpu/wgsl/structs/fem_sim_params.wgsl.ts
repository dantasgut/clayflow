/**
 * Struct WGSL: FEMSimParams — parâmetros globais da simulação FEM por substep.
 *
 * Layout: 64 bytes (4 × vec4, alinhamento std140 correto para uniform buffer).
 *
 *   offset  0: gravity (vec3f, align=16) + dt_sub (f32)    → 16 bytes
 *   offset 16: mu + lambda + damping + collision_radius     → 16 bytes
 *   offset 32: alpha_h + alpha_d + dt_frame + restitution   → 16 bytes
 *   offset 48: collider_count + node_count + elem_count + solve_iters → 16 bytes
 *   Total: 64 bytes
 *
 * Escrito pela CPU (FEMComputePass) uma vez por substep antes dos dispatches.
 * Lido por todos os kernels FEM via @group(0) @binding(0).
 *
 * Parâmetros de material (mu, lambda): constantes de Lamé.
 *   mu     — módulo de cisalhamento (rigidez a deformação sem mudança de volume)
 *   lambda — módulo de bulk (resistência à mudança de volume)
 *
 * Compliances XPBD (pré-calculados na CPU):
 *   alpha_h = 1 / (lambda + 2*mu)   — compliance hidrostático
 *   alpha_d = 1 / mu                — compliance desviador
 */
export const WGSL_STRUCT_FEM_SIM_PARAMS = /* wgsl */`

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
}
`;
