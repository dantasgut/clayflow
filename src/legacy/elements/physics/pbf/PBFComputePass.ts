/**
 * PBFComputePass — pipeline GPU Position-Based Fluids (Macklin & Müller 2013).
 *
 * Estende FluidComputePassBase; implementa apenas a lógica específica de PBF.
 *
 * ## Sequência por substep
 *
 * ```
 * 1. encodeNeighborBuild
 * 2. dispatch pbf_predict
 * 3. loop iterations × (pbf_density_lambda + pbf_position_correct)
 * 4. dispatch pbf_velocity_update
 * 5. dispatch pbf_vorticity
 * 6. dispatch pbf_xsph
 * 7. dispatch pbf_collision
 * ```
 *
 * ## Buffers
 *
 *   Global: `gpu_pbf_simparams` (uniform, 80 bytes)
 *   Por corpo: `gpu_pbf_particles_{uuid}` (storage PBFParticle[], N × 64 bytes)
 */

import { FluidComputePassBase }    from '../shared/FluidComputePassBase';
import type { GpuSimContext }      from '../../../scene/systems/GpuSimContext';
import type { Force }              from '../../../scene/systems/forces/Force';
import { COLLIDERS_BUFFER_ID }     from '../shared/ColliderDescriptorUploader';
import { PIPELINE_IDS }            from '../shared/ShaderLibrary';
import type { NeighborSearchGrid } from '../shared/NeighborSearchGrid';
import type { PBFBody }            from '../PBFBody';
import {
    PBF_SIM_PARAMS_BUFFER_ID,
    PBF_SIM_PARAMS_BYTES,
    PBF_PARTICLE_STRIDE_BYTES,
    PBF_PARTICLE_STRIDE_FLOATS,
    buildPBFBufferIds,
    packPBFParticles,
} from './PBFBufferLayout';
import {
    PBFSP_GRAVITY_X, PBFSP_GRAVITY_Y, PBFSP_GRAVITY_Z, PBFSP_DT_SUB,
    PBFSP_REST_RHO, PBFSP_H, PBFSP_EPSILON, PBFSP_S_CORR_K,
    PBFSP_S_CORR_N, PBFSP_VORTICITY, PBFSP_XSPH_C, PBFSP_DT_FRAME,
    PBFSP_PARTICLE_COUNT, PBFSP_COLLIDER_COUNT, PBFSP_MAX_NEIGHBORS, PBFSP_PARTICLE_STRIDE,
    PBFSP_BOUND_MIN_X, PBFSP_BOUND_MIN_Y, PBFSP_BOUND_MIN_Z, PBFSP_RESTITUTION,
} from './PBFSimParamsLayout';

export interface PBFPassConfig {
    substeps?:    number;   // default: 4
    iterations?:  number;   // default: 3
    maxParticles?: number;  // default: 10000
    boundsMin?:   [number, number, number];
}

type PBFBodyBGs = {
    predict:       GPUBindGroup;
    densityLambda: GPUBindGroup;
    posCorrect:    GPUBindGroup;
    velUpdate:     GPUBindGroup;
    vorticity:     GPUBindGroup;
    xsph:          GPUBindGroup;
    collision:     GPUBindGroup;
};

type PBFGlobalBGs = {
    simParams: GPUBindGroup;
    neighbors: GPUBindGroup;
    colliders: GPUBindGroup;
};

export class PBFComputePass extends FluidComputePassBase<PBFBody, PBFGlobalBGs, PBFBodyBGs> {

    public readonly passId = 'PBFBody';
    public readonly acceptedPhysicTypes: readonly string[] = ['PBFBody'];

    protected readonly simParamsBufferId   = PBF_SIM_PARAMS_BUFFER_ID;
    protected readonly particleStrideFloats = PBF_PARTICLE_STRIDE_FLOATS;

    private readonly iterations: number;

    constructor(
        globalForces: Map<string, Force>,
        neighborGrid: NeighborSearchGrid,
        config?: PBFPassConfig,
    ) {
        super(
            globalForces,
            neighborGrid,
            config?.substeps   ?? 4,
            config?.boundsMin  ?? [-10, -1, -10],
            PBF_SIM_PARAMS_BYTES,
        );
        this.iterations = config?.iterations ?? 3;
    }

    // ── Alocação ──────────────────────────────────────────────────────────────

    protected allocateBody(pbf: PBFBody): void {
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

    // ── SimParams ─────────────────────────────────────────────────────────────

    protected writeSimParams(
        bodies: PBFBody[], dtFrame: number, dtSub: number,
        totalParticles: number, colliderCount: number,
        gx: number, gy: number, gz: number,
    ): void {
        const f32 = this.simParamsF32;
        const u32 = this.simParamsU32;
        const b   = bodies[0]!;

        f32[PBFSP_GRAVITY_X]       = gx;
        f32[PBFSP_GRAVITY_Y]       = gy;
        f32[PBFSP_GRAVITY_Z]       = gz;
        f32[PBFSP_DT_SUB]          = dtSub;
        f32[PBFSP_REST_RHO]        = b.get<number>('restDensity')          ?? 1000;
        f32[PBFSP_H]               = b.get<number>('smoothingRadius')       ?? 0.1;
        f32[PBFSP_EPSILON]         = b.get<number>('epsilon')               ?? 600;
        f32[PBFSP_S_CORR_K]       = b.get<number>('sCorrK')               ?? 0.001;
        u32[PBFSP_S_CORR_N]       = b.get<number>('sCorrN')               ?? 4;
        f32[PBFSP_VORTICITY]       = b.get<number>('vorticityConfinement') ?? 0.01;
        f32[PBFSP_XSPH_C]         = b.get<number>('xsph')                 ?? 0.01;
        f32[PBFSP_DT_FRAME]        = dtFrame;
        u32[PBFSP_PARTICLE_COUNT]  = totalParticles;
        u32[PBFSP_COLLIDER_COUNT]  = colliderCount;
        u32[PBFSP_MAX_NEIGHBORS]   = 64;
        u32[PBFSP_PARTICLE_STRIDE] = PBF_PARTICLE_STRIDE_FLOATS;
        f32[PBFSP_BOUND_MIN_X]     = this.boundsMin[0];
        f32[PBFSP_BOUND_MIN_Y]     = this.boundsMin[1];
        f32[PBFSP_BOUND_MIN_Z]     = this.boundsMin[2];
        f32[PBFSP_RESTITUTION]     = b.get<number>('restitution') ?? 0.0;
    }

    // ── Bind groups ───────────────────────────────────────────────────────────

    protected buildGlobalBGs(): PBFGlobalBGs | null {
        const compute = this.core.compute;
        const buffers = this.core.resources.buffers;

        const simBuf = buffers.getBuffer(PBF_SIM_PARAMS_BUFFER_ID)?.native;
        const colBuf = buffers.getBuffer(COLLIDERS_BUFFER_ID)?.native;
        if (!simBuf || !colBuf) return null;

        const nbListBuf  = this.neighborGrid.getNeighborListBuffer();
        const nbCountBuf = this.neighborGrid.getNeighborCountBuffer();

        const bg = (id: string, grp: number, entries: GPUBindGroupEntry[], label: string) =>
            compute.createBindGroupFromPipeline(id, grp, entries, label);

        return {
            simParams: bg(PIPELINE_IDS.PBF_PREDICT, 0,
                [{ binding: 0, resource: { buffer: simBuf } }], 'pbf_bg_sim'),
            neighbors: bg(PIPELINE_IDS.PBF_DENSITY_LAMBDA, 2, [
                { binding: 0, resource: { buffer: nbListBuf  } },
                { binding: 1, resource: { buffer: nbCountBuf } },
            ], 'pbf_bg_neighbors'),
            colliders: bg(PIPELINE_IDS.PBF_COLLISION, 2,
                [{ binding: 0, resource: { buffer: colBuf } }], 'pbf_bg_colliders'),
        };
    }

    protected buildBodyBGs(pbf: PBFBody): PBFBodyBGs {
        const compute = this.core.compute;
        const buffers = this.core.resources.buffers;
        const pBuf    = buffers.getBuffer(pbf.bufferIds!.particlesId)!.native;
        const uid     = pbf.uuid.slice(0, 8);

        const bg = (id: string, grp: number, entries: GPUBindGroupEntry[], label: string) =>
            compute.createBindGroupFromPipeline(id, grp, entries, label);

        const pEntry = { binding: 0, resource: { buffer: pBuf } };

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

    // ── Substep ───────────────────────────────────────────────────────────────

    protected encodeSubstep(
        encoder: GPUCommandEncoder,
        _body: PBFBody,
        gbg: PBFGlobalBGs,
        bg: PBFBodyBGs,
        wg: number,
        s: number,
    ): void {
        const compute = this.core.compute;

        const predPass = compute.beginComputePassExplicit(encoder, `pbf_predict_${s}`);
        compute.dispatchOnPass(predPass, PIPELINE_IDS.PBF_PREDICT, [gbg.simParams, bg.predict], wg);
        predPass.end();

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

        const vuPass = compute.beginComputePassExplicit(encoder, `pbf_vu_${s}`);
        compute.dispatchOnPass(vuPass, PIPELINE_IDS.PBF_VELOCITY_UPDATE, [gbg.simParams, bg.velUpdate], wg);
        vuPass.end();

        const vtPass = compute.beginComputePassExplicit(encoder, `pbf_vt_${s}`);
        compute.dispatchOnPass(vtPass, PIPELINE_IDS.PBF_VORTICITY,
            [gbg.simParams, bg.vorticity, gbg.neighbors], wg);
        vtPass.end();

        const xsPass = compute.beginComputePassExplicit(encoder, `pbf_xs_${s}`);
        compute.dispatchOnPass(xsPass, PIPELINE_IDS.PBF_XSPH,
            [gbg.simParams, bg.xsph, gbg.neighbors], wg);
        xsPass.end();

        const colPass = compute.beginComputePassExplicit(encoder, `pbf_col_${s}`);
        compute.dispatchOnPass(colPass, PIPELINE_IDS.PBF_COLLISION,
            [gbg.simParams, bg.collision, gbg.colliders], wg);
        colPass.end();
    }
}
