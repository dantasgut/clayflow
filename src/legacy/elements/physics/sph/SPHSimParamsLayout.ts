/**
 * SPHSimParamsLayout — offsets do uniform SPHSimParams (96 bytes = 6 × vec4).
 *
 * ## Layout (Float32Array view, salvo onde indicado Uint32)
 *
 *   vec4f gravity_dt    [0..3]  — gravity.xyz, dt_sub
 *   vec4f fluid         [4..7]  — rest_density, h, stiffness_k0, gamma(7)
 *   vec4f viscosity     [8..11] — viscosity_mu, xsph_c, pad, pad
 *   vec4u counts        [12..15]— particle_count, collider_count, max_neighbors, particle_stride_f32
 *   vec4f bounds        [16..19]— bound_min.xyz, restitution
 *   vec4f mass          [20..23]— particle_mass, inv_particle_mass, pad, pad
 */

// vec4f [0]: gravity_dt
export const SPHSP_GRAVITY_X      = 0;
export const SPHSP_GRAVITY_Y      = 1;
export const SPHSP_GRAVITY_Z      = 2;
export const SPHSP_DT_SUB         = 3;

// vec4f [1]: fluid properties
export const SPHSP_REST_RHO       = 4;   // ρ₀
export const SPHSP_H              = 5;   // smoothing radius h
export const SPHSP_STIFFNESS      = 6;   // k₀ (equação de estado)
export const SPHSP_GAMMA          = 7;   // γ=7 (WCSPH EOS exponent)

// vec4f [2]: viscosity + xsph
export const SPHSP_VISCOSITY      = 8;   // μ coeficiente dinâmico
export const SPHSP_XSPH_C        = 9;   // XSPH c
export const SPHSP_DT_FRAME       = 10;  // dt do frame (informacional)
// [11] = pad

// vec4u [3]: counts (u32 view)
export const SPHSP_PARTICLE_COUNT  = 12;  // u32
export const SPHSP_COLLIDER_COUNT  = 13;  // u32
export const SPHSP_MAX_NEIGHBORS   = 14;  // u32
export const SPHSP_PARTICLE_STRIDE = 15;  // u32 — SPH_PARTICLE_STRIDE_FLOATS

// vec4f [4]: bounds
export const SPHSP_BOUND_MIN_X    = 16;
export const SPHSP_BOUND_MIN_Y    = 17;
export const SPHSP_BOUND_MIN_Z    = 18;
export const SPHSP_RESTITUTION    = 19;

// vec4f [5]: mass
export const SPHSP_PARTICLE_MASS  = 20;
export const SPHSP_INV_MASS       = 21;
// [22..23] = pad
