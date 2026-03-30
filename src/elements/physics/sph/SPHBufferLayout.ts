/**
 * SPHBufferLayout — contratos de naming, tamanho e serialização dos buffers GPU do SPH (WCSPH).
 *
 * ## SPHParticle (64 bytes = 4 × vec4f)
 *
 *   pos:   vec4f  — xyz=posição,              w=densidade ρ
 *   vel:   vec4f  — xyz=velocidade,           w=pressão p
 *   force: vec4f  — xyz=força acumulada,      w=pad
 *   color: vec4f  — XSPH velocity correction, w=pad
 *
 * ## SPHSimParams (96 bytes = 6 × vec4)
 */

// ── Strides ───────────────────────────────────────────────────────────────────

/** Bytes por partícula (SPHParticle: 4 × vec4f). */
export const SPH_PARTICLE_STRIDE_BYTES  = 64;
/** Floats por partícula. */
export const SPH_PARTICLE_STRIDE_FLOATS = 16;

/** Bytes do uniform SPHSimParams. */
export const SPH_SIM_PARAMS_BYTES = 96;

// ── Offsets nas partículas (Float32Array view) ────────────────────────────────

export const SP_POS_X   = 0;   // pos.x
export const SP_POS_Y   = 1;   // pos.y
export const SP_POS_Z   = 2;   // pos.z
export const SP_DENSITY = 3;   // pos.w = ρ
export const SP_VEL_X   = 4;   // vel.x
export const SP_VEL_Y   = 5;   // vel.y
export const SP_VEL_Z   = 6;   // vel.z
export const SP_PRESSURE= 7;   // vel.w = p
export const SP_FORCE_X = 8;   // force.x
export const SP_FORCE_Y = 9;   // force.y
export const SP_FORCE_Z = 10;  // force.z
// force.w = pad [11]
// color.xyz = XSPH correction [12-14], color.w = pad [15]

// ── IDs de buffers ────────────────────────────────────────────────────────────

/** ID do uniform buffer global de simulação SPH. */
export const SPH_SIM_PARAMS_BUFFER_ID = 'gpu_sph_simparams';

export interface SPHBufferIds {
    particlesId: string;
}

export function buildSPHBufferIds(uuid: string): SPHBufferIds {
    return { particlesId: `gpu_sph_particles_${uuid}` };
}

// ── Serialização CPU → GPU ────────────────────────────────────────────────────

export interface SPHParticleInit {
    x: number; y: number; z: number;
    vx?: number; vy?: number; vz?: number;
}

/**
 * Serializa partículas SPH em Float32Array.
 * ρ e p inicializados como restDensity e 0.
 */
export function packSPHParticles(
    particles:   SPHParticleInit[],
    out:         Float32Array,
    restDensity: number,
): void {
    for (let i = 0; i < particles.length; i++) {
        const p = particles[i]!;
        const b = i * SPH_PARTICLE_STRIDE_FLOATS;

        out[b + SP_POS_X]    = p.x;
        out[b + SP_POS_Y]    = p.y;
        out[b + SP_POS_Z]    = p.z;
        out[b + SP_DENSITY]  = restDensity;

        out[b + SP_VEL_X]    = p.vx ?? 0;
        out[b + SP_VEL_Y]    = p.vy ?? 0;
        out[b + SP_VEL_Z]    = p.vz ?? 0;
        out[b + SP_PRESSURE] = 0;
        // force, color = 0 por default
    }
}
