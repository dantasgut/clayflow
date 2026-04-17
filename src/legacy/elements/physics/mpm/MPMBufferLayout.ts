/**
 * MPMBufferLayout — contratos de naming, tamanho e serialização dos buffers GPU do MPM.
 *
 * ## Arquitetura de buffers
 *
 * **Buffers globais** (gerenciados por MPMComputePass, não por corpo):
 *   - `MPM_GRID_BUFFER_ID`        — grade MPM: array de MPMGridNode (8×i32 = 32 bytes/nó)
 *   - `MPM_SIM_PARAMS_BUFFER_ID`  — uniform MPMSimParams (96 bytes)
 *
 * **Buffers por corpo** (um conjunto por MPMBody):
 *   - `gpu_mpm_particles_{uuid}`  — array de MPMParticle (128 bytes/partícula)
 *
 * ## MPMParticle (128 bytes = 8 × vec4f)
 *
 *   pos:    vec4f — xyz=posição world, w=massa
 *   vel:    vec4f — xyz=velocidade,   w=volume de repouso V0_p
 *   F_col0: vec4f — col0 de F, w=det(F) cache
 *   F_col1: vec4f — col1 de F, w=material_id override
 *   F_col2: vec4f — col2 de F, w=padding
 *   C_col0: vec4f — col0 da matriz afim C
 *   C_col1: vec4f — col1 de C
 *   C_col2: vec4f — col2 de C
 *
 * ## MPMGridNode (32 bytes = 4×atomic<i32> + vec3f + pad)
 *
 *   mass_i32:  atomic<i32>
 *   mom_x_i32: atomic<i32>
 *   mom_y_i32: atomic<i32>
 *   mom_z_i32: atomic<i32>
 *   vel:       vec3f
 *   _pad:      f32
 */

// ── Strides ───────────────────────────────────────────────────────────────────

/** Bytes por partícula (MPMParticle: 8 × vec4f). */
export const MPM_PARTICLE_STRIDE_BYTES  = 128;
/** Floats por partícula. */
export const MPM_PARTICLE_STRIDE_FLOATS = 32;

/** Bytes por nó de grade (MPMGridNode: 4×i32 + vec3f + pad = 8×4). */
export const MPM_GRID_NODE_STRIDE_BYTES = 32;

/** Bytes do uniform MPMSimParams. */
export const MPM_SIM_PARAMS_BYTES = 96;

// ── Offsets nas partículas (Float32Array view) ────────────────────────────────
export const MP_POS_X   = 0;   // pos.x
export const MP_POS_Y   = 1;   // pos.y
export const MP_POS_Z   = 2;   // pos.z
export const MP_MASS    = 3;   // pos.w = mass
export const MP_VEL_X   = 4;   // vel.x
export const MP_VEL_Y   = 5;   // vel.y
export const MP_VEL_Z   = 6;   // vel.z
export const MP_VOL0    = 7;   // vel.w = volume de repouso V0_p
// F coluna 0 (offsets 8-11): F[0].x, F[0].y, F[0].z, det(F)
export const MP_F0_X    = 8;
export const MP_F0_Y    = 9;
export const MP_F0_Z    = 10;
export const MP_DET_F   = 11;  // det(F) cache
// F coluna 1 (offsets 12-15): F[1].x, F[1].y, F[1].z, material_id
export const MP_F1_X    = 12;
export const MP_F1_Y    = 13;
export const MP_F1_Z    = 14;
export const MP_MAT_ID  = 15;  // material_id override
// F coluna 2 (offsets 16-19): F[2].x, F[2].y, F[2].z, pad
export const MP_F2_X    = 16;
export const MP_F2_Y    = 17;
export const MP_F2_Z    = 18;
// C coluna 0-2 (offsets 20-31)
export const MP_C0_X    = 20;
export const MP_C0_Y    = 21;
export const MP_C0_Z    = 22;
export const MP_C1_X    = 24;
export const MP_C1_Y    = 25;
export const MP_C1_Z    = 26;
export const MP_C2_X    = 28;
export const MP_C2_Y    = 29;
export const MP_C2_Z    = 30;

// ── IDs de buffers ────────────────────────────────────────────────────────────

/** ID do buffer de grade global (compartilhado entre todos os corpos MPM). */
export const MPM_GRID_BUFFER_ID       = 'gpu_mpm_grid';

/** ID do uniform buffer global de simulação MPM. */
export const MPM_SIM_PARAMS_BUFFER_ID = 'gpu_mpm_simparams';

export interface MPMBufferIds {
    particlesId: string;
}

export function buildMPMBufferIds(uuid: string): MPMBufferIds {
    return { particlesId: `gpu_mpm_particles_${uuid}` };
}

// ── Serialização CPU → GPU ────────────────────────────────────────────────────

export interface MPMParticleInit {
    x: number; y: number; z: number;
    vx: number; vy: number; vz: number;
    mass:    number;
    volume0: number;
    /** 0=dinâmico (padrão), override material_id para esta partícula. */
    materialId?: number;
}

/**
 * Serializa partículas MPM em Float32Array.
 * F é inicializado como identidade I₃; C como zeros 0₃ₓ₃.
 *
 * @param particles  dados iniciais de cada partícula
 * @param out        Float32Array de destino, tamanho >= particles.length × MPM_PARTICLE_STRIDE_FLOATS
 */
export function packMPMParticles(
    particles: MPMParticleInit[],
    out:       Float32Array,
): void {
    for (let i = 0; i < particles.length; i++) {
        const p = particles[i]!;
        const b = i * MPM_PARTICLE_STRIDE_FLOATS;

        // pos + mass
        out[b + MP_POS_X]  = p.x;
        out[b + MP_POS_Y]  = p.y;
        out[b + MP_POS_Z]  = p.z;
        out[b + MP_MASS]   = p.mass;

        // vel + volume0
        out[b + MP_VEL_X]  = p.vx;
        out[b + MP_VEL_Y]  = p.vy;
        out[b + MP_VEL_Z]  = p.vz;
        out[b + MP_VOL0]   = p.volume0;

        // F = identity (column-major)
        out[b + MP_F0_X]   = 1;  out[b + MP_F0_Y]  = 0;  out[b + MP_F0_Z]  = 0;
        out[b + MP_DET_F]  = 1;  // det(I) = 1
        out[b + MP_F1_X]   = 0;  out[b + MP_F1_Y]  = 1;  out[b + MP_F1_Z]  = 0;
        out[b + MP_MAT_ID] = p.materialId ?? 0;
        out[b + MP_F2_X]   = 0;  out[b + MP_F2_Y]  = 0;  out[b + MP_F2_Z]  = 1;

        // C = zeros (offsets 20-31 são 0 por default do ArrayBuffer)
    }
}
