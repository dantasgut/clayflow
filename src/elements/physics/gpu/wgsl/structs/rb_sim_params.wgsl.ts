/**
 * Struct WGSL: RBSimParams — parâmetros globais da simulação de corpos rígidos.
 *
 * Layout: 80 bytes (5 × vec4f).
 *
 *   offset  0: gravity                (vec4f) — xyz=aceleração gravitacional, w=dt (substep)
 *   offset 16: body_count             (u32)   — número de corpos rígidos no buffer
 *   offset 20: collider_count         (u32)   — número de ColliderDesc no buffer
 *   offset 24: max_contacts           (u32)   — slots pré-alocados = body_count * collider_count
 *   offset 28: solve_iters            (u32)   — iterações Gauss-Seidel por substep (K)
 *   offset 32: dt_frame               (f32)   — dt do frame inteiro (= dtSub * substeps)
 *   offset 36: restitution            (f32)   — coeficiente de restituição [0,1]
 *   offset 40: penetration_slop       (f32)   — margem de tolerância de penetração (subtrai do depth no XPBD)
 *   offset 44: linear_damping         (f32)   — taxa de amortecimento linear por substep (1/s)
 *   offset 48: angular_damping        (f32)   — taxa de amortecimento angular por substep (1/s)
 *   offset 52: _pad1d                 (f32)   — padding (alinhamento vec4f)
 *   offset 56: predictive_threshold   (f32)   — margem especulativa: d_proj < 0 ativa contato iminente
 *   offset 60: restitution_threshold  (f32)   — abaixo desta velocidade de aproximação (m/s), e = 0
 *   offset 64: sleep_lin_threshold    (f32)   — vel abaixo deste valor (m/s) → zerar (pseudo-sleep, 0=off)
 *   offset 68: _pad2a                 (f32)   — padding para alinhamento a 80 bytes
 *   Total: 80 bytes
 *
 * Escrito pela CPU (GpuRigidBodyPipeline) uma vez por frame antes dos dispatches.
 * Lido por todos os kernels de física rígida via @group(0) @binding(0).
 *
 * Depende de: nenhum outro módulo.
 */
export const WGSL_STRUCT_RB_SIM_PARAMS = /* wgsl */`

struct RBSimParams {
    gravity:                vec4f,  // xyz=aceleração gravitacional, w=dt (substep)
    body_count:             u32,
    collider_count:         u32,
    max_contacts:           u32,    // = body_count * collider_count (slots pré-alocados)
    solve_iters:            u32,    // iterações Gauss-Seidel por substep (K)
    dt_frame:               f32,    // dt do frame inteiro (= gravity.w * substeps)
    restitution:            f32,    // coeficiente de restituição [0, 1]
    penetration_slop:       f32,    // margem de tolerância de penetração (subtrai do depth no XPBD)
    linear_damping:         f32,    // taxa de amortecimento linear por substep (1/s)
    angular_damping:        f32,    // taxa de amortecimento angular por substep (1/s)
    _pad1d:                 f32,    // padding (alinhamento vec4f)
    predictive_threshold:   f32,    // margem especulativa: d_proj < 0 ativa contato iminente
    restitution_threshold:  f32,    // abaixo desta velocidade de aproximação (m/s), e = 0
    sleep_lin_threshold:    f32,    // vel abaixo deste valor (m/s) → zerar (pseudo-sleep, 0=off)
    _pad2a:                 f32,    // padding para alinhamento a 80 bytes
}
`;
