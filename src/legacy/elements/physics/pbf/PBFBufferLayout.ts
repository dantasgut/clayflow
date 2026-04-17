/**
 * PBFBufferLayout — contratos de naming, tamanho e serialização dos buffers GPU do PBF.
 *
 * ## PBFParticle (64 bytes = 4 × vec4f)
 *
 *   pos:    vec4f  — xyz=posição,   w=lambda (multiplicador de constraint)
 *   vel:    vec4f  — xyz=velocidade, w=pad
 *   posOld: vec4f  — posição antes do substep (para cálculo de vel ao final)
 *   curl:   vec4f  — curl(v) para vorticity confinement, w=pad
 *
 * ## PBFSimParams (80 bytes = 5 × vec4)
 *
 *   Mapeados via Float32Array/Uint32Array.
 *   Ver PBFSimParamsLayout.ts para constantes de offset.
 */

// ── Strides ───────────────────────────────────────────────────────────────────

/** Bytes por partícula (PBFParticle: 4 × vec4f). */
export const PBF_PARTICLE_STRIDE_BYTES  = 64;
/** Floats por partícula. */
export const PBF_PARTICLE_STRIDE_FLOATS = 16;

/** Bytes do uniform PBFSimParams. */
export const PBF_SIM_PARAMS_BYTES = 80;

// ── Offsets nas partículas (Float32Array view) ────────────────────────────────

export const PP_POS_X    = 0;   // pos.x
export const PP_POS_Y    = 1;   // pos.y
export const PP_POS_Z    = 2;   // pos.z
export const PP_LAMBDA   = 3;   // pos.w = lambda
export const PP_VEL_X    = 4;   // vel.x
export const PP_VEL_Y    = 5;   // vel.y
export const PP_VEL_Z    = 6;   // vel.z
// vel.w = pad [7]
export const PP_OLD_X    = 8;   // posOld.x
export const PP_OLD_Y    = 9;   // posOld.y
export const PP_OLD_Z    = 10;  // posOld.z
// posOld.w = pad [11]
export const PP_CURL_X   = 12;  // curl.x
export const PP_CURL_Y   = 13;  // curl.y
export const PP_CURL_Z   = 14;  // curl.z
// curl.w = pad [15]

// ── IDs de buffers ────────────────────────────────────────────────────────────

/** ID do uniform buffer global de simulação PBF. */
export const PBF_SIM_PARAMS_BUFFER_ID = 'gpu_pbf_simparams';

export interface PBFBufferIds {
    particlesId: string;
}

export function buildPBFBufferIds(uuid: string): PBFBufferIds {
    return { particlesId: `gpu_pbf_particles_${uuid}` };
}

// ── Serialização CPU → GPU ────────────────────────────────────────────────────

export interface PBFParticleInit {
    x: number; y: number; z: number;
    vx?: number; vy?: number; vz?: number;
}

/**
 * Serializa partículas PBF em Float32Array.
 * lambda e curl são inicializados como zero.
 */
export function packPBFParticles(
    particles: PBFParticleInit[],
    out:       Float32Array,
): void {
    for (let i = 0; i < particles.length; i++) {
        const p = particles[i]!;
        const b = i * PBF_PARTICLE_STRIDE_FLOATS;

        out[b + PP_POS_X]  = p.x;
        out[b + PP_POS_Y]  = p.y;
        out[b + PP_POS_Z]  = p.z;
        out[b + PP_LAMBDA] = 0;

        out[b + PP_VEL_X]  = p.vx ?? 0;
        out[b + PP_VEL_Y]  = p.vy ?? 0;
        out[b + PP_VEL_Z]  = p.vz ?? 0;
        // [7] = 0 pad

        out[b + PP_OLD_X]  = p.x;
        out[b + PP_OLD_Y]  = p.y;
        out[b + PP_OLD_Z]  = p.z;
        // [11] = 0 pad

        // curl = 0 [12-15]
    }
}
