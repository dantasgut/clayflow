/**
 * Layout do uniform buffer `SimParams` (48 bytes) do pass de simulação de
 * corpo deformável (XPBD SoftBody).
 *
 * Cada constante é um índice de elemento no ArrayBuffer interpretado como
 * Float32Array ou Uint32Array.
 *
 * Layout completo (12 × f32 = 48 bytes):
 *   [0]   gravity.x       — aceleração gravitacional X (m/s²)
 *   [1]   gravity.y       — aceleração gravitacional Y (m/s²)
 *   [2]   gravity.z       — aceleração gravitacional Z (m/s²)
 *   [3]   dt              — dt do substep
 *   [4]   restitution     — coeficiente de restituição partícula-collisor [0, 1]
 *   [5]   damping         — coeficiente de amortecimento
 *   [6]   particle_radius — raio de colisão virtual de cada partícula (m)
 *   [7]   particle_count  — u32: número de partículas
 *   [8]   constraint_count — u32: número de constraints
 *   [9]   collider_count  — u32: número de colliders ativos
 *   [10]  shape_stiffness — rigidez do Shape Matching [0, 1]
 *   [11]  _pad            — padding
 */

export const SP_GRAVITY_X        = 0;
export const SP_GRAVITY_Y        = 1;
export const SP_GRAVITY_Z        = 2;
export const SP_DT               = 3;
export const SP_RESTITUTION      = 4;
export const SP_DAMPING          = 5;
export const SP_PARTICLE_RADIUS  = 6;
export const SP_PARTICLE_COUNT   = 7;   // u32 view index
export const SP_CONSTRAINT_COUNT = 8;   // u32 view index
export const SP_COLLIDER_COUNT   = 9;   // u32 view index
export const SP_SHAPE_STIFFNESS  = 10;
/** Raio de contato com colliders externos (0 = toca na superfície; era _pad). */
export const SP_COLLISION_RADIUS = 11;

/** Tamanho total do buffer em bytes. */
export const SOFT_SIM_PARAMS_BYTE_SIZE = 48;
