/**
 * SPHSimParams struct — parâmetros globais de simulação SPH WCSPH.
 *
 * 96 bytes = 6 × vec4.
 */
export const WGSL_STRUCT_SPH_SIM_PARAMS = /* wgsl */`
struct SPHSimParams {
    gravity_dt: vec4f,   // xyz=gravidade, w=dt_sub
    fluid:      vec4f,   // x=rest_density, y=h, z=stiffness_k0, w=gamma
    viscosity:  vec4f,   // x=viscosity_mu, y=xsph_c, z=dt_frame, w=pad
    counts:     vec4u,   // x=particle_count, y=collider_count, z=max_neighbors, w=particle_stride_f32
    bounds:     vec4f,   // xyz=bound_min, w=restitution
    mass:       vec4f,   // x=particle_mass, y=inv_particle_mass, z=pad, w=pad
}
`;
