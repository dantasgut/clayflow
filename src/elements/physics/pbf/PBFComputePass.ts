/**
 * PBFComputePass — pipeline GPU Position-Based Fluids (Macklin & Müller 2013).
 *
 * Implementa PhysicsComputePass sem herança (padrão MPMComputePass).
 * Recebe um NeighborSearchGrid compartilhado via constructor.
 *
 * ## Sequência por frame
 *
 * ```
 * Para cada substep:
 *   1. writeSimParams
 *   2. encodeNeighborBuild (NeighborSearchGrid)
 *   3. dispatch pbf_predict
 *   4. loop iterations:
 *      4a. dispatch pbf_density_lambda
 *      4b. dispatch pbf_position_correct
 *   5. dispatch pbf_velocity_update
 *   6. dispatch pbf_vorticity
 *   7. dispatch pbf_xsph
 *   8. dispatch pbf_collision
 * submit
 * ```
 *
 * ## Buffers
 *
 *   Global: `gpu_pbf_simparams` (uniform PBFSimParams, 80 bytes)
 *   Por corpo: `gpu_pbf_particles_{uuid}` (storage PBFParticle[], N × 64 bytes)
 *   Vizinhos: gerenciados por NeighborSearchGrid (injetado)
 *   Colliders: `gpu_colliders_global` (gerenciado por ColliderDescriptorUploader)
 *
 * ## Bind groups por pipeline
 *
 *   predict:          group(0)=simParams, group(1)=particles
 *   density_lambda:   group(0)=simParams, group(1)=particles, group(2)=[nb_list, nb_count]
 *   position_correct: group(0)=simParams, group(1)=particles, group(2)=[nb_list, nb_count]
 *   velocity_update:  group(0)=simParams, group(1)=particles
 *   vorticity:        group(0)=simParams, group(1)=particles, group(2)=[nb_list, nb_count]
 *   xsph:             group(0)=simParams, group(1)=particles, group(2)=[nb_list, nb_count]
 *   collision:        group(0)=simParams, group(1)=particles, group(2)=colliders
 */

import { WebGPUEngineCore }        from '../../../core/WebGPUEngineCore';
import type { EngineCore }         from '../../../core/interfaces/EngineCore';
import type { PhysicsComputePass } from '../../../scene/systems/PhysicsComputePass';
import type { GpuSimContext }      from '../../../scene/systems/GpuSimContext';
import type { Force }              from '../../../scene/systems/forces/Force';
import { PhysicsBodyState }        from '../../../scene/core/physics/PhysicsBodyState';
import { COLLIDERS_BUFFER_ID }     from '../shared/ColliderDescriptorUploader';
import {
    PIPELINE_IDS,
    ensurePhysicsPipelinesInitialized,
} from '../shared/ShaderLibrary';
import type { NeighborSearchGrid } from '../shared/NeighborSearchGrid';
import type { PBFBody }            from '../PBFBody';
import {
    PBF_SIM_PARAMS_BUFFER_ID,
    PBF_SIM_PARAMS_BYTES,
    PBF_PARTICLE_STRIDE_BYTES,
    PBF_PARTICLE_STRIDE_FLOATS,
    buildPBFBufferIds,
    packPBFParticles,
    type PBFBufferIds,
} from './PBFBufferLayout';
import {
    PBFSP_GRAVITY_X, PBFSP_GRAVITY_Y, PBFSP_GRAVITY_Z, PBFSP_DT_SUB,
    PBFSP_REST_RHO, PBFSP_H, PBFSP_EPSILON, PBFSP_S_CORR_K,
    PBFSP_S_CORR_N, PBFSP_VORTICITY, PBFSP_XSPH_C, PBFSP_DT_FRAME,
    PBFSP_PARTICLE_COUNT, PBFSP_COLLIDER_COUNT, PBFSP_MAX_NEIGHBORS, PBFSP_PARTICLE_STRIDE,
    PBFSP_BOUND_MIN_X, PBFSP_BOUND_MIN_Y, PBFSP_BOUND_MIN_Z, PBFSP_RESTITUTION,
} from './PBFSimParamsLayout';

export interface PBFPassConfig {
    /** Substeps por frame. Default: 4. */
    substeps?:   number;
    /** Iterações do solver de constraint por substep. Default: 3. */
    iterations?: number;
    /** Capacidade máxima de partículas (para o NeighborSearchGrid). Default: 10000. */
    maxParticles?: number;
    /** Bounds AABB mínimo [x,y,z]. Default: [-10,-1,-10]. */
    boundsMin?: [number, number, number];
}

/** Bind groups por corpo PBF (reutilizados entre frames). */
type PBFBodyBGs = {
    predict:         GPUBindGroup;
    densityLambda:   GPUBindGroup;
    posCorrect:      GPUBindGroup;
    velUpdate:       GPUBindGroup;
    vorticity:       GPUBindGroup;
    xsph:            GPUBindGroup;
    collision:       GPUBindGroup;
};

/** Bind groups globais e de vizinhos (criados após pipelines e buffers prontos). */
type PBFGlobalBGs = {
    simParams:    GPUBindGroup;   // group(0) — reutilizado em todos
    neighbors:    GPUBindGroup;   // group(2) — nb_list + nb_count (density, posCorrect, vorticity, xsph)
    colliders:    GPUBindGroup;   // group(2) — collision
};

export class PBFComputePass implements PhysicsComputePass {

    public readonly passId = 'PBFBody';
    public readonly acceptedPhysicTypes: readonly string[] = ['PBFBody'];

    private core: EngineCore = WebGPUEngineCore.getInstance();
    private ready        = false;
    private initPromise: Promise<void> | null = null;
    private globalReady  = false;

    private readonly substeps:    number;
    private readonly iterations:  number;
    private readonly maxParticles: number;
    private readonly boundsMin:   [number, number, number];

    private readonly neighborGrid: NeighborSearchGrid;

    private readonly bgCache = new Map<string, PBFBodyBGs>();
    private globalBG: PBFGlobalBGs | null = null;

    private readonly simParamsBuf = new ArrayBuffer(PBF_SIM_PARAMS_BYTES);
    private readonly simParamsF32 = new Float32Array(this.simParamsBuf);
    private readonly simParamsU32 = new Uint32Array(this.simParamsBuf);

    constructor(
        private readonly globalForces: Map<string, Force>,
        neighborGrid: NeighborSearchGrid,
        config?: PBFPassConfig,
    ) {
        this.neighborGrid  = neighborGrid;
        this.substeps      = config?.substeps    ?? 4;
        this.iterations    = config?.iterations  ?? 3;
        this.maxParticles  = config?.maxParticles ?? 10000;
        this.boundsMin     = config?.boundsMin    ?? [-10, -1, -10];
    }

    // ── PhysicsComputePass ────────────────────────────────────────────────────

    public ensureReady(core: EngineCore): Promise<void> {
        this.core = core;
        if (!this.initPromise) this.kickInit();
        return this.initPromise ?? Promise.resolve();
    }

    public dispose(): void {
        this.bgCache.clear();
        this.globalBG = null;
        const buffers = this.core.resources.buffers;
        if (buffers.getBuffer(PBF_SIM_PARAMS_BUFFER_ID)) {
            buffers.destroyBuffer(PBF_SIM_PARAMS_BUFFER_ID);
        }
        this.neighborGrid.dispose();
    }

    public execute(context: GpuSimContext, dtFrame: number): void {
        if (!this.ready) { this.kickInit(); return; }
        if (dtFrame <= 0) return;

        if (!this.globalReady) this.createGlobalBuffers();
        if (!this.globalReady) return;

        const core    = this.core;
        const compute = core.compute;
        const buffers = core.resources.buffers;

        if (context.colliderBufferRecreated) {
            this.bgCache.clear();
            this.globalBG = null;
        }

        // Coleta corpos ativos
        const activeBodies: PBFBody[] = [];
        for (const { body } of context.bodies.values()) {
            if (body.physicType !== 'PBFBody') continue;
            if (body.bodyState === PhysicsBodyState.Inactive) continue;
            const pbf = body as unknown as PBFBody;
            if (!pbf.bufferIds) this.allocateBody(pbf);
            if (!pbf.bufferIds) continue;
            if (pbf.particles.length === 0) continue;
            activeBodies.push(pbf);
        }
        if (activeBodies.length === 0) return;

        const firstBody = activeBodies[0]!;
        const totalParticles = activeBodies.reduce((s, b) => s + b.particles.length, 0);

        // Força global (gravidade)
        let gx = 0, gy = 0, gz = 0;
        for (const force of this.globalForces.values()) {
            const f = force.compute(firstBody, dtFrame);
            gx += f[0] ?? 0; gy += f[1] ?? 0; gz += f[2] ?? 0;
        }

        const dtSub = dtFrame / this.substeps;

        this.simParamsF32[PBFSP_GRAVITY_X]      = gx;
        this.simParamsF32[PBFSP_GRAVITY_Y]      = gy;
        this.simParamsF32[PBFSP_GRAVITY_Z]      = gz;
        this.simParamsF32[PBFSP_DT_SUB]         = dtSub;
        this.simParamsF32[PBFSP_REST_RHO]       = firstBody.get<number>('restDensity')    ?? 1000;
        this.simParamsF32[PBFSP_H]              = firstBody.get<number>('smoothingRadius') ?? 0.1;
        this.simParamsF32[PBFSP_EPSILON]        = firstBody.get<number>('epsilon')         ?? 600;
        this.simParamsF32[PBFSP_S_CORR_K]      = firstBody.get<number>('sCorrK')          ?? 0.001;
        this.simParamsU32[PBFSP_S_CORR_N]      = firstBody.get<number>('sCorrN')          ?? 4;
        this.simParamsF32[PBFSP_VORTICITY]      = firstBody.get<number>('vorticityConfinement') ?? 0.01;
        this.simParamsF32[PBFSP_XSPH_C]        = firstBody.get<number>('xsph')            ?? 0.01;
        this.simParamsF32[PBFSP_DT_FRAME]       = dtFrame;
        this.simParamsU32[PBFSP_PARTICLE_COUNT] = totalParticles;
        this.simParamsU32[PBFSP_COLLIDER_COUNT] = context.colliderCount;
        this.simParamsU32[PBFSP_MAX_NEIGHBORS]  = 64;
        this.simParamsU32[PBFSP_PARTICLE_STRIDE]= PBF_PARTICLE_STRIDE_FLOATS;
        this.simParamsF32[PBFSP_BOUND_MIN_X]    = this.boundsMin[0];
        this.simParamsF32[PBFSP_BOUND_MIN_Y]    = this.boundsMin[1];
        this.simParamsF32[PBFSP_BOUND_MIN_Z]    = this.boundsMin[2];
        this.simParamsF32[PBFSP_RESTITUTION]    = firstBody.get<number>('restitution')    ?? 0.0;
        buffers.writeBuffer(PBF_SIM_PARAMS_BUFFER_ID, this.simParamsF32);

        // Garante bind groups globais
        if (!this.globalBG) this.globalBG = this.buildGlobalBGs();
        if (!this.globalBG) return;

        // Garante bind groups por corpo
        for (const pbf of activeBodies) {
            if (!this.bgCache.has(pbf.uuid)) {
                this.bgCache.set(pbf.uuid, this.buildBodyBGs(pbf));
            }
        }

        const gbg = this.globalBG;

        try {
            const encoder = core.renderPasses.createCommandEncoder('pbf_gpu');

            for (let s = 0; s < this.substeps; s++) {

                // ── Neighbor build ────────────────────────────────────────────
                // Usa o buffer de partículas do primeiro corpo.
                // Multi-corpo: para simplificar F2, assume um único PBFBody ativo.
                const firstBuf = buffers.getBuffer(activeBodies[0]!.bufferIds!.particlesId)!.native;
                this.neighborGrid.encodeNeighborBuild(
                    encoder,
                    firstBuf,
                    totalParticles,
                    PBF_PARTICLE_STRIDE_FLOATS,
                );

                for (const pbf of activeBodies) {
                    const bg  = this.bgCache.get(pbf.uuid)!;
                    const wg  = Math.ceil(pbf.particles.length / 64);

                    // ── Predict ───────────────────────────────────────────────
                    const predPass = compute.beginComputePassExplicit(encoder, `pbf_predict_${s}`);
                    compute.dispatchOnPass(predPass, PIPELINE_IDS.PBF_PREDICT, [gbg.simParams, bg.predict], wg);
                    predPass.end();

                    // ── Solver iterations ─────────────────────────────────────
                    for (let it = 0; it < this.iterations; it++) {
                        const dlPass = compute.beginComputePassExplicit(encoder, `pbf_dl_${s}_${it}`);
                        compute.dispatchOnPass(dlPass, PIPELINE_IDS.PBF_DENSITY_LAMBDA,
                            [gbg.simParams, bg.densityLambda, gbg.neighbors], wg);
                        dlPass.end();

                        const pcPass = compute.beginComputePassExplicit(encoder, `pbf_pc_${s}_${it}`);
                        compute.dispatchOnPass(pcPass, PIPELINE_IDS.PBF_POSITION_CORRECT,
                            [gbg.simParams, bg.posCorrect, gbg.neighbors], wg);
                        pcPass.end();
                    }

                    // ── Velocity update ───────────────────────────────────────
                    const vuPass = compute.beginComputePassExplicit(encoder, `pbf_vu_${s}`);
                    compute.dispatchOnPass(vuPass, PIPELINE_IDS.PBF_VELOCITY_UPDATE, [gbg.simParams, bg.velUpdate], wg);
                    vuPass.end();

                    // ── Vorticity ─────────────────────────────────────────────
                    const vtPass = compute.beginComputePassExplicit(encoder, `pbf_vt_${s}`);
                    compute.dispatchOnPass(vtPass, PIPELINE_IDS.PBF_VORTICITY,
                        [gbg.simParams, bg.vorticity, gbg.neighbors], wg);
                    vtPass.end();

                    // ── XSPH ──────────────────────────────────────────────────
                    const xsPass = compute.beginComputePassExplicit(encoder, `pbf_xs_${s}`);
                    compute.dispatchOnPass(xsPass, PIPELINE_IDS.PBF_XSPH,
                        [gbg.simParams, bg.xsph, gbg.neighbors], wg);
                    xsPass.end();

                    // ── Collision ─────────────────────────────────────────────
                    const colPass = compute.beginComputePassExplicit(encoder, `pbf_col_${s}`);
                    compute.dispatchOnPass(colPass, PIPELINE_IDS.PBF_COLLISION,
                        [gbg.simParams, bg.collision, gbg.colliders], wg);
                    colPass.end();
                }
            }

            core.renderPasses.submit([encoder]);
        } catch (err) {
            console.error('[PBFComputePass] encode falhou:', err);
            this.bgCache.clear();
            this.globalBG = null;
        }
    }

    // ── Alocação por corpo ────────────────────────────────────────────────────

    private allocateBody(pbf: PBFBody): void {
        const buffers = this.core.resources.buffers;
        const n = pbf.particles.length;
        if (n === 0) return;

        const ids = buildPBFBufferIds(pbf.uuid);
        buffers.createStorageBuffer(ids.particlesId, Math.max(n, 1) * PBF_PARTICLE_STRIDE_BYTES);

        const f32 = new Float32Array(n * PBF_PARTICLE_STRIDE_FLOATS);
        packPBFParticles(pbf.particles, f32);
        buffers.writeBuffer(ids.particlesId, f32);

        pbf.bufferIds = ids;
    }

    // ── Buffers globais ───────────────────────────────────────────────────────

    private createGlobalBuffers(): void {
        const buffers = this.core.resources.buffers;
        buffers.createUniformBuffer(PBF_SIM_PARAMS_BUFFER_ID, PBF_SIM_PARAMS_BYTES);
        this.globalReady = true;
    }

    // ── Bind groups ───────────────────────────────────────────────────────────

    private buildGlobalBGs(): PBFGlobalBGs | null {
        const compute = this.core.compute;
        const buffers = this.core.resources.buffers;

        const simBuf  = buffers.getBuffer(PBF_SIM_PARAMS_BUFFER_ID)?.native;
        const colBuf  = buffers.getBuffer(COLLIDERS_BUFFER_ID)?.native;
        if (!simBuf || !colBuf) return null;

        const nbListBuf  = this.neighborGrid.getNeighborListBuffer();
        const nbCountBuf = this.neighborGrid.getNeighborCountBuffer();

        const bg = (id: string, grp: number, entries: GPUBindGroupEntry[], label: string) =>
            compute.createBindGroupFromPipeline(id, grp, entries, label);

        const simParams = bg(PIPELINE_IDS.PBF_PREDICT, 0, [{ binding: 0, resource: { buffer: simBuf } }], 'pbf_bg_sim');
        const neighbors = bg(PIPELINE_IDS.PBF_DENSITY_LAMBDA, 2, [
            { binding: 0, resource: { buffer: nbListBuf  } },
            { binding: 1, resource: { buffer: nbCountBuf } },
        ], 'pbf_bg_neighbors');
        const colliders = bg(PIPELINE_IDS.PBF_COLLISION, 2, [{ binding: 0, resource: { buffer: colBuf } }], 'pbf_bg_colliders');

        return { simParams, neighbors, colliders };
    }

    private buildBodyBGs(pbf: PBFBody): PBFBodyBGs {
        const compute = this.core.compute;
        const buffers = this.core.resources.buffers;

        const pBuf = buffers.getBuffer(pbf.bufferIds!.particlesId)!.native;

        const bg = (id: string, grp: number, entries: GPUBindGroupEntry[], label: string) =>
            compute.createBindGroupFromPipeline(id, grp, entries, label);

        const pEntry = { binding: 0, resource: { buffer: pBuf } };
        const uid    = pbf.uuid.slice(0, 8);

        return {
            predict:       bg(PIPELINE_IDS.PBF_PREDICT,          1, [pEntry], `pbf_predict_${uid}`),
            densityLambda: bg(PIPELINE_IDS.PBF_DENSITY_LAMBDA,   1, [pEntry], `pbf_dl_${uid}`),
            posCorrect:    bg(PIPELINE_IDS.PBF_POSITION_CORRECT,  1, [pEntry], `pbf_pc_${uid}`),
            velUpdate:     bg(PIPELINE_IDS.PBF_VELOCITY_UPDATE,   1, [pEntry], `pbf_vu_${uid}`),
            vorticity:     bg(PIPELINE_IDS.PBF_VORTICITY,         1, [pEntry], `pbf_vt_${uid}`),
            xsph:          bg(PIPELINE_IDS.PBF_XSPH,              1, [pEntry], `pbf_xs_${uid}`),
            collision:     bg(PIPELINE_IDS.PBF_COLLISION,         1, [pEntry], `pbf_col_${uid}`),
        };
    }

    // ── Init ─────────────────────────────────────────────────────────────────

    private kickInit(): void {
        this.initPromise = ensurePhysicsPipelinesInitialized(this.core)
            .then(() => { this.ready = true; })
            .catch(err => {
                console.error('[PBFComputePass] falha na compilação de pipeline:', err);
                this.initPromise = null;
            });
    }
}
