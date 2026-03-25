/**
 * Struct WGSL: RBSimParams — parâmetros globais da simulação de corpos rígidos.
 *
 * Layout: 64 bytes (4 × vec4f).
 *
 *   offset  0: gravity        (vec4f) — xyz=aceleração gravitacional, w=dt (substep)
 *   offset 16: body_count     (u32)   — número de corpos rígidos no buffer
 *   offset 20: collider_count (u32)   — número de ColliderDesc no buffer
 *   offset 24: max_contacts   (u32)   — slots pré-alocados = body_count * collider_count
 *   offset 28: solve_iters     (u32)   — iterações Gauss-Seidel por substep (K)
 *   offset 32: _pad1          (vec4f) — padding para 64 bytes
 *   Total: 64 bytes
 *
 * Escrito pela CPU (GpuRigidBodyPipeline) uma vez por frame antes dos dispatches.
 * Lido por todos os kernels de física rígida via @group(0) @binding(0).
 *
 * Depende de: nenhum outro módulo.
 */
export const WGSL_STRUCT_RB_SIM_PARAMS = /* wgsl */`

struct RBSimParams {
    gravity:        vec4f,  // xyz=aceleração gravitacional, w=dt (substep)
    body_count:     u32,
    collider_count: u32,
    max_contacts:   u32,    // = body_count * collider_count (slots pré-alocados)
    solve_iters:    u32,    // iterações Gauss-Seidel por substep (K)
    _pad1:          vec4f,  // padding para 64 bytes
}
`;
