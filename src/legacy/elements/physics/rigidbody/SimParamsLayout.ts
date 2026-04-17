/**
 * Layout do uniform buffer `RBSimParams` (80 bytes) compartilhado pelos passes
 * de simulação de corpo rígido (XPBD e LCP).
 *
 * Cada constante é um índice de elemento no ArrayBuffer interpretado como
 * Float32Array ou Uint32Array — os dois views compartilham o mesmo buffer.
 *
 * Layout completo (20 × f32 = 80 bytes):
 *   [0..2]  gravity.xyz     — aceleração gravitacional (m/s²)
 *   [3]     dt_substep      — dt do substep (dt_frame / substeps)
 *   [4]     body_count      — u32: número de corpos rígidos ativos
 *   [5]     collider_count  — u32: número de colliders ativos
 *   [6]     max_contacts    — u32: slots de contato pré-alocados
 *   [7]     solve_iters     — u32: iterações do solver por substep
 *   [8]     dt_frame        — dt do frame inteiro (= dt_substep × substeps)
 *   [9]     restitution     — coeficiente de restituição [0, 1]
 *   [10]    penetration_slop — margem de tolerância de penetração (m)
 *   [11]    linear_damping  — taxa de amortecimento linear (1/s)
 *   [12]    angular_damping — taxa de amortecimento angular (1/s)
 *   [13]    _pad            — padding
 *   [14]    predictive_threshold  — margem especulativa (m), 0 = desativado
 *   [15]    restitution_threshold — velocidade (m/s) abaixo da qual e=0
 *   [16]    sleep_lin_threshold   — velocidade (m/s) para pseudo-sleep
 *   [17]    _pad2           — padding
 *   [18]    baumgarte_beta  — fator de Baumgarte [0.1–0.3] (LCP only)
 *   [19]    warm_start_factor — fator de warm start [0.8–1.0] (LCP only)
 */

export const SP_GRAVITY_X             = 0;
export const SP_GRAVITY_Y             = 1;
export const SP_GRAVITY_Z             = 2;
export const SP_DT                    = 3;
export const SP_BODY_COUNT            = 4;   // u32 view index
export const SP_COLLIDER_COUNT        = 5;   // u32 view index
export const SP_MAX_CONTACTS          = 6;   // u32 view index
export const SP_SOLVE_ITERS           = 7;   // u32 view index
export const SP_DT_FRAME              = 8;
export const SP_RESTITUTION           = 9;
export const SP_PENETRATION_SLOP      = 10;
export const SP_LINEAR_DAMPING        = 11;
export const SP_ANGULAR_DAMPING       = 12;
// índice 13: _pad
export const SP_PREDICTIVE_THRESHOLD  = 14;
export const SP_RESTITUTION_THRESHOLD = 15;
export const SP_SLEEP_LIN_THRESHOLD   = 16;
// índice 17: _pad2
export const SP_BAUMGARTE_BETA        = 18;  // LCP only
export const SP_WARM_START_FACTOR     = 19;  // LCP only

/** Tamanho total do buffer em bytes. */
export const RB_SIM_PARAMS_BYTE_SIZE = 80;
