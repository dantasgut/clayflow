/**
 * PBFSimParamsLayout — offsets do uniform PBFSimParams (80 bytes = 5 × vec4).
 *
 * ## Layout em memória (Float32Array view, exceto onde indicado Uint32)
 *
 *   vec4f  gravity_dt     [0..3]  — gravity.xyz, dt_sub
 *   vec4f  config         [4..7]  — rest_density, h, epsilon, s_corr_k
 *   vec4f  config2        [8..11] — s_corr_n(u32 view), vorticity, xsph_c, pad
 *   vec4u  counts         [12..15]— particle_count, collider_count, max_neighbors, particle_stride_f32
 *   vec4f  bounds         [16..19]— aabb min.xyz, aabb max (packed as w of another vec)
 *
 * Nota: bounds usa [16]=min.x [17]=min.y [18]=min.z [19]=max_extent(scalar)
 * para simplificar — WGSL lê vec4f bounds e interpreta .w como restitution.
 */

// vec4f [0]: gravity_dt
export const PBFSP_GRAVITY_X   = 0;
export const PBFSP_GRAVITY_Y   = 1;
export const PBFSP_GRAVITY_Z   = 2;
export const PBFSP_DT_SUB      = 3;

// vec4f [1]: config
export const PBFSP_REST_RHO    = 4;   // ρ₀ (kg/m³)
export const PBFSP_H           = 5;   // smoothing radius h (m)
export const PBFSP_EPSILON     = 6;   // relaxação λ
export const PBFSP_S_CORR_K    = 7;   // s_corr amplitude k

// vec4f [2]: config2 + u32
export const PBFSP_S_CORR_N    = 8;   // u32 view: expoente s_corr n
export const PBFSP_VORTICITY   = 9;   // coeficiente vorticity confinement
export const PBFSP_XSPH_C      = 10;  // coeficiente XSPH
export const PBFSP_DT_FRAME    = 11;  // dt do frame completo (para vertex timing)

// vec4u [3]: counts (lidos como u32)
export const PBFSP_PARTICLE_COUNT    = 12;  // u32
export const PBFSP_COLLIDER_COUNT    = 13;  // u32
export const PBFSP_MAX_NEIGHBORS     = 14;  // u32
export const PBFSP_PARTICLE_STRIDE   = 15;  // u32 — stride em f32 (PBF_PARTICLE_STRIDE_FLOATS)

// vec4f [4]: bounds AABB
export const PBFSP_BOUND_MIN_X = 16;
export const PBFSP_BOUND_MIN_Y = 17;
export const PBFSP_BOUND_MIN_Z = 18;
export const PBFSP_RESTITUTION = 19;  // coeficiente de restituição colisão (0–1)
