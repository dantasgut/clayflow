/**
 * SoftBodyBufferLayout — contratos de naming, tamanho e serialização dos buffers GPU do SoftBody.
 *
 * Análogo a `RigidBodyLayout.ts` para o subsistema de partículas/constraints.
 * Centraliza:
 *   - IDs de buffer (via `buildSoftBodyBufferSet` e helpers de naming)
 *   - Tamanhos em bytes (via `softBodyBufferSizes`)
 *   - Serialização CPU→GPU (funções `pack*` puras, sem ResourceManager ou GPU)
 *
 * Permite testar o packing em isolamento e elimina strings literais de
 * ID de buffer dispersas no `PhysicsResourceLoader`.
 */

import type { SoftParticle, SoftConstraint } from '../SoftBody';
import type { SoftBodyGpuBufferSet }         from '../SoftBodyGpuBufferSet';
import { PARTICLE_STRIDE_BYTES,
         PARTICLE_STRIDE_FLOATS,
         P_POS_X, P_POS_Y, P_POS_Z, P_INV_MASS,
         P_PRED_X, P_PRED_Y, P_PRED_Z,
         P_VEL_X, P_VEL_Y, P_VEL_Z }        from './ParticleLayout';
import { CONSTRAINT_STRIDE_BYTES,
         CONSTRAINT_STRIDE_WORDS,
         C_IDX_A, C_IDX_B,
         C_REST_LENGTH, C_COMPLIANCE }        from './ConstraintLayout';

export { PARTICLE_STRIDE_FLOATS, CONSTRAINT_STRIDE_BYTES };

// ── Tamanhos em bytes dos buffers auxiliares ──────────────────────────────────

/** Tamanho em bytes do uniform `SimParams` do SoftBody. */
export const SB_SIM_PARAMS_SIZE     = 48;

/** Tamanho em bytes de cada uniform `ColorRange`. */
export const SB_COLOR_RANGE_SIZE    = 16;

/** Stride em bytes do buffer de lambda (warm-starting). */
export const SB_LAMBDA_STRIDE       = 4;

/** Stride em bytes do buffer de acumulador Jacobi. */
export const SB_JACOBI_ACCUM_STRIDE = 16;

/** Stride em bytes do buffer de posições de repouso (shape matching). */
export const SB_REST_POS_STRIDE     = 16;

/** Stride em bytes do buffer de goal positions (shape matching). */
export const SB_GOAL_POS_STRIDE     = 16;

/** Tamanho em bytes do buffer de shape state (quaternion warm-start). */
export const SB_SHAPE_STATE_SIZE    = 16;

// ── Tamanhos calculados por instância ────────────────────────────────────────

/** Tamanhos em bytes de cada buffer de uma instância SoftBody. */
export interface SoftBodyBufferSizes {
    particlesBytes:   number;
    constraintsBytes: number;
    lambdaBytes:      number;
    lambdaWarmBytes:  number;
    jacobiAccumBytes: number;
    restPosBytes:     number;
    goalPosBytes:     number;
}

/**
 * Calcula os tamanhos em bytes de todos os buffers de um SoftBody.
 * `Math.max(..., 1)` garante buffers não-zero mesmo para corpos vazios.
 */
export function softBodyBufferSizes(pCount: number, cCount: number): SoftBodyBufferSizes {
    const p = Math.max(pCount, 1);
    const c = Math.max(cCount, 1);
    return {
        particlesBytes:   p * PARTICLE_STRIDE_BYTES,
        constraintsBytes: c * CONSTRAINT_STRIDE_BYTES,
        lambdaBytes:      c * SB_LAMBDA_STRIDE,
        lambdaWarmBytes:  c * SB_LAMBDA_STRIDE,
        jacobiAccumBytes: p * SB_JACOBI_ACCUM_STRIDE,
        restPosBytes:     p * SB_REST_POS_STRIDE,
        goalPosBytes:     p * SB_GOAL_POS_STRIDE,
    };
}

// ── Naming — IDs de buffer ────────────────────────────────────────────────────

/**
 * Constrói o conjunto tipado de IDs para os buffers de uma instância SoftBody.
 * `colorRangeIds` e `colorCounts` são populados durante a fase de alocação,
 * após o graph coloring determinar quantas cores existem.
 */
export function buildSoftBodyBufferSet(uuid: string): SoftBodyGpuBufferSet {
    return {
        particlesId:   `gpu_particles_${uuid}`,
        constraintsId: `gpu_constraints_${uuid}`,
        simParamsId:   `gpu_simparams_${uuid}`,
        lambdaBufId:   `gpu_lambda_${uuid}`,
        lambdaWarmId:  `gpu_lambda_warm_${uuid}`,
        jacobiAccumId: `gpu_jacobi_accum_${uuid}`,
        colorRangeIds: [],
        colorCounts:   [],
    };
}

/** ID do uniform buffer `ColorRange` para a cor de índice `colorIndex`. */
export function buildColorRangeId(uuid: string, colorIndex: number): string {
    return `gpu_color_range_${uuid}_${colorIndex}`;
}

/** ID do storage buffer de posições de repouso (shape matching). */
export function buildRestPosId(uuid: string): string {
    return `gpu_rest_pos_${uuid}`;
}

/** ID do storage buffer de goal positions (shape matching). */
export function buildGoalPosId(uuid: string): string {
    return `gpu_goal_pos_${uuid}`;
}

/** ID do storage buffer de shape state (quaternion warm-start). */
export function buildShapeStateId(uuid: string): string {
    return `gpu_shape_state_${uuid}`;
}

// ── Packing — serialização CPU→GPU ────────────────────────────────────────────

/**
 * Serializa as partículas de um SoftBody em um Float32Array.
 *
 * @param particles lista de partículas do corpo
 * @param invMassF  massa inversa para partículas livres (= pCount / mass)
 * @param f32       buffer de destino, tamanho >= particles.length × PARTICLE_STRIDE_FLOATS
 */
export function packSoftBodyParticles(
    particles: SoftParticle[],
    invMassF:  number,
    f32:       Float32Array,
): void {
    for (let i = 0; i < particles.length; i++) {
        const p = particles[i]!;
        const b = i * PARTICLE_STRIDE_FLOATS;
        f32[b + P_POS_X]    = p.x;
        f32[b + P_POS_Y]    = p.y;
        f32[b + P_POS_Z]    = p.z;
        f32[b + P_INV_MASS] = p.w > 0 ? invMassF : 0.0;
        f32[b + P_PRED_X]   = p.px;
        f32[b + P_PRED_Y]   = p.py;
        f32[b + P_PRED_Z]   = p.pz;
        f32[b + P_VEL_X]    = p.vx;
        f32[b + P_VEL_Y]    = p.vy;
        f32[b + P_VEL_Z]    = p.vz;
    }
}

/**
 * Serializa constraints ordenadas por cor em views duplas sobre o mesmo ArrayBuffer.
 * `f32` e `u32` devem apontar para o mesmo `ArrayBuffer`.
 *
 * @param sortedConstraints constraints reordenadas pelo graph coloring
 * @param f32               view float para rest_length e compliance
 * @param u32               view uint para índices i e j
 */
export function packSoftBodyConstraints(
    sortedConstraints: SoftConstraint[],
    f32:               Float32Array,
    u32:               Uint32Array,
): void {
    for (let k = 0; k < sortedConstraints.length; k++) {
        const c    = sortedConstraints[k]!;
        const base = k * CONSTRAINT_STRIDE_WORDS;
        u32[base + C_IDX_A]       = c.i;
        u32[base + C_IDX_B]       = c.j;
        f32[base + C_REST_LENGTH] = c.restLength;
        f32[base + C_COMPLIANCE]  = c.compliance;
    }
}

/**
 * Serializa um intervalo de cor (offset + count) no buffer ColorRange.
 *
 * @param offset índice da primeira constraint desta cor no buffer global
 * @param count  número de constraints desta cor
 * @param u32    Uint32Array[4] de destino (já alocado pelo chamador)
 */
export function packColorRange(
    offset: number,
    count:  number,
    u32:    Uint32Array,
): void {
    u32[0] = offset;
    u32[1] = count;
    u32[2] = 0;
    u32[3] = 0;
}

/**
 * Serializa as posições de repouso centradas no centro de massa das partículas livres.
 * Usado na inicialização do shape matching.
 *
 * @param particles lista de partículas do corpo
 * @param f32       Float32Array de destino, tamanho >= particles.length × 4
 */
export function packRestPositions(particles: SoftParticle[], f32: Float32Array): void {
    let cmx = 0, cmy = 0, cmz = 0, freeCount = 0;
    for (const p of particles) {
        if (p.w > 0) { cmx += p.x; cmy += p.y; cmz += p.z; freeCount++; }
    }
    if (freeCount > 0) { cmx /= freeCount; cmy /= freeCount; cmz /= freeCount; }

    for (let i = 0; i < particles.length; i++) {
        const p = particles[i]!;
        f32[i * 4]     = p.x - cmx;
        f32[i * 4 + 1] = p.y - cmy;
        f32[i * 4 + 2] = p.z - cmz;
        f32[i * 4 + 3] = p.w > 0 ? 1.0 : 0.0;
    }
}
