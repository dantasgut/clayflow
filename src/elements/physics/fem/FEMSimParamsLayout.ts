/**
 * Layout do uniform buffer `FEMSimParams` (64 bytes) do pipeline FEM.
 *
 * Cada constante é um índice de elemento no ArrayBuffer interpretado como
 * Float32Array ou Uint32Array (ambas apontando para o mesmo buffer).
 *
 * Layout completo (16 × f32/u32 = 64 bytes):
 *   [0]  gravity.x         — aceleração gravitacional X (m/s²)
 *   [1]  gravity.y         — aceleração gravitacional Y (m/s²)
 *   [2]  gravity.z         — aceleração gravitacional Z (m/s²)
 *   [3]  dt_sub            — dt do substep (dt_frame / substeps)
 *   [4]  mu                — módulo de cisalhamento de Lamé
 *   [5]  lambda            — módulo de bulk de Lamé
 *   [6]  damping           — fator de amortecimento de velocidade por substep [0..1]
 *   [7]  collision_radius  — raio de contato com colliders (0 = superfície exata)
 *   [8]  alpha_h           — compliance hidrostático = 1/(lambda + 2*mu)
 *   [9]  alpha_d           — compliance desviador    = 1/mu
 *   [10] dt_frame          — passo de tempo do frame completo
 *   [11] restitution       — coeficiente de restituição na colisão nó-SDF [0..1]
 *   [12] collider_count    — u32: número de ColliderDesc no buffer
 *   [13] node_count        — u32: número total de nós (partículas)
 *   [14] elem_count        — u32: número total de elementos tetraédricos
 *   [15] solve_iters       — u32: iterações de solve por substep (serial fallback)
 */

export const FSP_GRAVITY_X        = 0;
export const FSP_GRAVITY_Y        = 1;
export const FSP_GRAVITY_Z        = 2;
export const FSP_DT_SUB           = 3;
export const FSP_MU               = 4;
export const FSP_LAMBDA           = 5;
export const FSP_DAMPING          = 6;
export const FSP_COLLISION_RADIUS = 7;
export const FSP_ALPHA_H          = 8;
export const FSP_ALPHA_D          = 9;
export const FSP_DT_FRAME         = 10;
export const FSP_RESTITUTION      = 11;
export const FSP_COLLIDER_COUNT   = 12;   // u32 view index
export const FSP_NODE_COUNT       = 13;   // u32 view index
export const FSP_ELEM_COUNT       = 14;   // u32 view index
export const FSP_SOLVE_ITERS      = 15;   // u32 view index

/** Tamanho total do buffer em bytes (4 × vec4 = 16 × 4 = 64). */
export const FEM_SIM_PARAMS_BYTE_SIZE = 64;
