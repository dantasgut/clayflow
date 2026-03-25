/**
 * SimBodyBufferAllocator — alocação e upload inicial dos buffers GPU por SoftBody.
 *
 * Responsabilidades:
 *   1. Aloca storage buffers (partículas, constraints) e uniform buffer (SimParams).
 *   2. Faz upload inicial das partículas e constraints via writeBuffer (síncrono).
 *   3. Armazena os IDs dos buffers no property bag do SoftBody (padrão Property Bag).
 *   4. Registra `gpuBuffersAllocated = true` para evitar realocação.
 *
 * Conversão de invMass:
 *   SoftParticle.w é 0 (fixada) ou 1 (livre). No buffer GPU, pos.w contém o
 *   invMass físico real: `0.0` para fixadas, `particleCount / mass` para livres.
 *   Esta conversão é feita aqui — o shader nunca divide.
 *
 * Property bag keys injetadas no SoftBody:
 *   'gpuParticlesId'      — string ID do storage buffer Particle[]
 *   'gpuConstraintsId'    — string ID do storage buffer DistanceConstraint[]
 *   'gpuSimParamsId'      — string ID do uniform buffer SimParams
 *   'gpuBuffersAllocated' — boolean, flag de guards
 *
 * Shape Matching (adicionais, presentes quando body.get('useShapeMatching') = true):
 *   'gpuRestPosId'        — string ID do storage buffer rest_positions[] (vec4f, read-only)
 *   'gpuGoalPosId'        — string ID do storage buffer goal_positions[] (vec4f, GPU-managed)
 *   'gpuShapeStateId'     — string ID do storage buffer shape_state[1] (quaternion warm-start)
 *
 * Arquitetura: Layer 3 → Facade Layer 1 (WebGPUEngineCore.getInstance()).
 */

import { WebGPUEngineCore }         from '../../../core/WebGPUEngineCore';
import type { SoftBody }             from '../SoftBody';
import { graphColorConstraints }     from './GraphColorSolver';

// Tamanhos em bytes — derivados dos WGSL structs comentados em wgsl/structs/
const PARTICLE_STRIDE    = 48;  // 3 × vec4f  (pos, pred, vel)
const CONSTRAINT_STRIDE  = 16;  // 4 × f32/u32 (i, j, rest_length, compliance)
const SIM_PARAMS_SIZE    = 48;  // uniform SimParams — múltiplo de 16 (std140)
const MIN_BUFFER_FLOATS  = 1;   // buffer de pelo menos 1 elemento para evitar zero-size
const REST_POS_STRIDE    = 16;  // vec4f por partícula (xyz=r_i centrada, w=peso)
const GOAL_POS_STRIDE    = 16;  // vec4f por partícula (xyz=g_i, w=0)
const SHAPE_STATE_SIZE   = 16;  // 1 × vec4f = quaternion warm-start
const COLOR_RANGE_SIZE   = 16;  // ColorRange: offset(u32) + count(u32) + _pad(vec2u)
const LAMBDA_STRIDE      = 4;   // f32 por constraint — warm-starting (Fase 3b)
const JACOBI_ACCUM_STRIDE = 16; // atomic<i32>[4] por partícula: dx, dy, dz, count (Fase 3d)

export class SimBodyBufferAllocator {

    public allocate(body: SoftBody): void {
        if (body.get<boolean>('gpuBuffersAllocated')) return;

        const core     = WebGPUEngineCore.getInstance();
        const buffers  = core.resources.buffers;
        const uuid     = body.uuid;
        const pCount   = body.particles.length;
        const cCount   = body.constraints.length;
        const mass     = body.get<number>('mass') ?? 1.0;
        const invMassF = pCount > 0 ? pCount / mass : 0.0;  // invMass para partículas livres

        // ── Particles ──────────────────────────────────────────────────────────
        const particlesId = `gpu_particles_${uuid}`;
        buffers.createStorageBuffer(particlesId, Math.max(pCount, MIN_BUFFER_FLOATS) * PARTICLE_STRIDE);

        if (pCount > 0) {
            // Layout por partícula (12 floats = 48 bytes):
            //   [0..2]  pos.xyz, [3]  pos.w  = invMass (0 se fixada)
            //   [4..6]  pred.xyz,[7]  pred.w = 0
            //   [8..10] vel.xyz, [11] vel.w  = 0
            const particleData = new Float32Array(pCount * 12);
            for (let i = 0; i < pCount; i++) {
                const p    = body.particles[i]!;
                const base = i * 12;
                particleData[base]      = p.x;
                particleData[base + 1]  = p.y;
                particleData[base + 2]  = p.z;
                particleData[base + 3]  = p.w > 0 ? invMassF : 0.0;  // invMass real
                particleData[base + 4]  = p.px;
                particleData[base + 5]  = p.py;
                particleData[base + 6]  = p.pz;
                particleData[base + 7]  = 0;
                particleData[base + 8]  = p.vx;
                particleData[base + 9]  = p.vy;
                particleData[base + 10] = p.vz;
                particleData[base + 11] = 0;
            }
            buffers.writeBuffer(particlesId, particleData);
        }

        // ── Constraints + Graph Coloring ───────────────────────────────────────
        const constraintsId = `gpu_constraints_${uuid}`;
        buffers.createStorageBuffer(constraintsId, Math.max(cCount, MIN_BUFFER_FLOATS) * CONSTRAINT_STRIDE);

        const colorRangeIds: string[] = [];
        const colorCounts:   number[] = [];

        if (cCount > 0) {
            // Graph coloring: reordena constraints por cor para dispatch paralelo (Fase 3a)
            const { sortedConstraints, colorRanges } = graphColorConstraints(body.constraints, pCount);

            // Upload constraints na ordem sorted-by-color
            const rawBuffer = new ArrayBuffer(cCount * CONSTRAINT_STRIDE);
            const f32View   = new Float32Array(rawBuffer);
            const u32View   = new Uint32Array(rawBuffer);
            for (let k = 0; k < cCount; k++) {
                const c    = sortedConstraints[k]!;
                const base = k * 4;
                u32View[base]     = c.i;
                u32View[base + 1] = c.j;
                f32View[base + 2] = c.restLength;
                f32View[base + 3] = c.compliance;
            }
            buffers.writeBuffer(constraintsId, f32View);

            // Cria um uniform buffer de 16 bytes por cor (ColorRange: offset, count, _pad)
            const colorRangeBuf = new ArrayBuffer(COLOR_RANGE_SIZE);
            const crU32         = new Uint32Array(colorRangeBuf);
            for (let c = 0; c < colorRanges.length; c++) {
                const rangeId = `gpu_color_range_${uuid}_${c}`;
                buffers.createUniformBuffer(rangeId, COLOR_RANGE_SIZE);
                crU32[0] = colorRanges[c]!.offset;
                crU32[1] = colorRanges[c]!.count;
                crU32[2] = 0; crU32[3] = 0;  // _pad
                buffers.writeBuffer(rangeId, crU32);
                colorRangeIds.push(rangeId);
                colorCounts.push(colorRanges[c]!.count);
            }
        }

        // ── SimParams ──────────────────────────────────────────────────────────
        const simParamsId = `gpu_simparams_${uuid}`;
        buffers.createUniformBuffer(simParamsId, SIM_PARAMS_SIZE);
        // Conteúdo escrito por GpuParticleSimPipeline.writeSimParams() cada frame.

        // ── Property bag ───────────────────────────────────────────────────────
        // ── Lambda buffer (warm-starting, Fase 3b) ────────────────────────────
        const lambdaBufId = `gpu_lambda_${uuid}`;
        buffers.createStorageBuffer(lambdaBufId, Math.max(cCount, MIN_BUFFER_FLOATS) * LAMBDA_STRIDE);
        // Zero-initializado pelo WebGPU na criação — λ=0 no primeiro frame é correto.

        // ── Lambda warm-start snapshot (Fase 5 fix) ──────────────────────────────────
        // Cópia do λ final do frame anterior — restaurado no início de cada substep.
        // Zero-init correto (primeiro frame sem warm-start é equivalente a λ=0).
        const lambdaWarmId = `gpu_lambda_warm_${uuid}`;
        buffers.createStorageBuffer(lambdaWarmId, Math.max(cCount, MIN_BUFFER_FLOATS) * LAMBDA_STRIDE);

        // ── Jacobi accumulator (Fase 3d) ───────────────────────────────────────
        // array<atomic<i32>>[pCount × 4]: dx, dy, dz, count por partícula.
        // Zero-inicializado pelo WebGPU — correto para a primeira iteração.
        const jacobiAccumId = `gpu_jacobi_accum_${uuid}`;
        buffers.createStorageBuffer(jacobiAccumId, Math.max(pCount, MIN_BUFFER_FLOATS) * JACOBI_ACCUM_STRIDE);

        body.set('gpuParticlesId',      particlesId);
        body.set('gpuConstraintsId',    constraintsId);
        body.set('gpuSimParamsId',      simParamsId);
        body.set('gpuColorRangeIds',    colorRangeIds);   // string[] — IDs dos uniforms por cor
        body.set('gpuColorCounts',      colorCounts);     // number[] — constraints por cor
        body.set('gpuLambdaBufId',      lambdaBufId);     // string — warm-starting buffer
        body.set('gpuLambdaWarmId',     lambdaWarmId);    // string — warm-start snapshot inter-frame
        body.set('gpuJacobiAccumId',    jacobiAccumId);   // string — Jacobi atomic accumulator
        body.set('gpuBuffersAllocated', true);

        // ── Shape Matching buffers (opcional) ──────────────────────────────────
        if (body.get<boolean>('useShapeMatching')) {
            this.allocateShapeMatching(body, uuid, pCount);
        }
    }

    private allocateShapeMatching(body: SoftBody, uuid: string, pCount: number): void {
        const core    = WebGPUEngineCore.getInstance();
        const buffers = core.resources.buffers;

        // Centro de massa de repouso (apenas partículas livres contribuem)
        let cmx = 0, cmy = 0, cmz = 0, freeCount = 0;
        for (const p of body.particles) {
            if (p.w > 0) { cmx += p.x; cmy += p.y; cmz += p.z; freeCount++; }
        }
        if (freeCount > 0) { cmx /= freeCount; cmy /= freeCount; cmz /= freeCount; }

        // rest_positions[i] = (r_i centrada, peso)
        const restData = new Float32Array(Math.max(pCount, 1) * 4);
        for (let i = 0; i < pCount; i++) {
            const p    = body.particles[i]!;
            const base = i * 4;
            restData[base]     = p.x - cmx;
            restData[base + 1] = p.y - cmy;
            restData[base + 2] = p.z - cmz;
            restData[base + 3] = p.w > 0 ? 1.0 : 0.0;  // 1 = livre, 0 = fixada
        }
        const restPosId = `gpu_rest_pos_${uuid}`;
        buffers.createStorageBuffer(restPosId, Math.max(pCount, 1) * REST_POS_STRIDE);
        if (pCount > 0) buffers.writeBuffer(restPosId, restData);

        // goal_positions — inteiramente gerenciado pela GPU, zero-init
        const goalPosId = `gpu_goal_pos_${uuid}`;
        buffers.createStorageBuffer(goalPosId, Math.max(pCount, 1) * GOAL_POS_STRIDE);

        // shape_state — quaternion identity (XYZW = 0,0,0,1) como warm-start inicial
        const shapeStateId   = `gpu_shape_state_${uuid}`;
        const shapeStateData = new Float32Array([0, 0, 0, 1]);
        buffers.createStorageBuffer(shapeStateId, SHAPE_STATE_SIZE);
        buffers.writeBuffer(shapeStateId, shapeStateData);

        body.set('gpuRestPosId',   restPosId);
        body.set('gpuGoalPosId',   goalPosId);
        body.set('gpuShapeStateId', shapeStateId);
    }
}
