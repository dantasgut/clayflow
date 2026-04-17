/**
 * Layout do uniform buffer `MPMSimParams` (96 bytes) do pipeline MPM.
 *
 * Cada constante é um índice de elemento no ArrayBuffer interpretado como
 * Float32Array ou Uint32Array (ambas sobre o mesmo buffer).
 *
 * Layout completo (24 × f32/u32 = 96 bytes = 6 × vec4):
 *   [0]  gravity.x          — aceleração gravitacional X (m/s²)
 *   [1]  gravity.y          — aceleração gravitacional Y (m/s²)
 *   [2]  gravity.z          — aceleração gravitacional Z (m/s²)
 *   [3]  dt_sub             — passo de tempo do substep (dt_frame / substeps)
 *   [4]  mu                 — Lamé shear = E / (2*(1+nu))
 *   [5]  lambda_lame        — Lamé bulk = E*nu / ((1+nu)*(1-2*nu))
 *   [6]  fixed_scale        — fator de ponto fixo para atomic<i32> (default 2^20)
 *   [7]  hardening          — coeficiente de hardening exponencial (snow)
 *   [8]  theta_c            — critical compression limit (snow)
 *   [9]  theta_s            — critical stretch limit (snow)
 *   [10] viscosity          — viscosidade dinâmica (fluid)
 *   [11] dt_frame           — passo de tempo do frame completo
 *   [12] particle_count     — u32: número total de partículas
 *   [13] grid_x             — u32: dimensão da grade X
 *   [14] grid_y             — u32: dimensão da grade Y
 *   [15] grid_z             — u32: dimensão da grade Z
 *   [16] grid_origin.x      — origem da grade em world space
 *   [17] grid_origin.y
 *   [18] grid_origin.z
 *   [19] cell_size          — dx: tamanho de célula em metros
 *   [20] collider_count     — u32: número de ColliderDesc
 *   [21] material_id        — u32: 0=elastic, 1=snow, 2=fluid, 3=sand
 *   [22] substep_count      — u32: substeps por frame
 *   [23] inv_dx             — 1.0 / cell_size (pré-calculado)
 */

export const MSP_GRAVITY_X       = 0;
export const MSP_GRAVITY_Y       = 1;
export const MSP_GRAVITY_Z       = 2;
export const MSP_DT_SUB          = 3;
export const MSP_MU              = 4;
export const MSP_LAMBDA_LAME     = 5;
export const MSP_FIXED_SCALE     = 6;
export const MSP_HARDENING       = 7;
export const MSP_THETA_C         = 8;
export const MSP_THETA_S         = 9;
export const MSP_VISCOSITY       = 10;
export const MSP_DT_FRAME        = 11;
export const MSP_PARTICLE_COUNT  = 12;   // u32 view index
export const MSP_GRID_X          = 13;   // u32 view index
export const MSP_GRID_Y          = 14;   // u32 view index
export const MSP_GRID_Z          = 15;   // u32 view index
export const MSP_GRID_ORIGIN_X   = 16;
export const MSP_GRID_ORIGIN_Y   = 17;
export const MSP_GRID_ORIGIN_Z   = 18;
export const MSP_CELL_SIZE       = 19;
export const MSP_COLLIDER_COUNT  = 20;   // u32 view index
export const MSP_MATERIAL_ID     = 21;   // u32 view index
export const MSP_SUBSTEP_COUNT   = 22;   // u32 view index
export const MSP_INV_DX          = 23;

/** Tamanho total do buffer em bytes (6 × vec4 = 24 × 4 = 96). */
export const MPM_SIM_PARAMS_BYTE_SIZE = 96;

/** Material IDs para MPMSimParams.material_id */
export const MPM_MATERIAL_ELASTIC = 0;
export const MPM_MATERIAL_SNOW    = 1;
export const MPM_MATERIAL_FLUID   = 2;
export const MPM_MATERIAL_SAND    = 3;
