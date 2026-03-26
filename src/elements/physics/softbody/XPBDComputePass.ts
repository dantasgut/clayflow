/**
 * SoftBodyXPBDComputePass — pipeline GPU para simulação de corpos deformáveis XPBD.
 *
 * Estágio de nível de frame (não por substep). Recebe dt_frame e executa
 * internamente N substeps via compute shaders (GPU-only).
 *
 * ## Sequência por frame
 *
 * ```
 * Para cada SoftBody com bufferSet alocado:
 *   1. allocate(body)           — cria buffers se necessário (lazy, síncrono)
 *   2. writeSimParams(...)      — atualiza uniform SimParams
 *   3. uploadColliders(context) — empacota ColliderDesc[] para a GPU
 *   4. Cria GPUCommandEncoder
 *      Para cada substep:
 *        4a. begin compute pass
 *        4b. dispatch predict              (ceil(N/64) workgroups)
 *        4c. [shape matching, se ativo]
 *            dispatch shape_match_transform (1 workgroup — serial)
 *            dispatch shape_correct         (ceil(N/64) workgroups)
 *        4d. dispatch distance_solve       (1 workgroup × iters — serial Gauss-Seidel)
 *        4e. dispatch collision            (ceil(N/64) workgroups)
 *        4f. dispatch velocity_update      (ceil(N/64) workgroups)
 *        4g. end compute pass
 *      4h. dispatch vertex_write (1 pass, ceil(N/64) workgroups)
 *   5. submit encoder
 * ```
 *
 * Arquitetura: Layer 3 → Facade Layer 1 (WebGPUEngineCore.getInstance()).
 */

import { WebGPUEngineCore }          from '../../../core/WebGPUEngineCore';
import type { SoftBody }              from '../SoftBody';
import type { Force }                 from '../../../scene/systems/forces/Force';
import type { Geometry }              from '../../../scene/components/Geometry';
import { ColliderDescriptorUploader, COLLIDERS_BUFFER_ID } from '../shared/ColliderDescriptorUploader';
import {
    PIPELINE_IDS,
    ensurePhysicsPipelinesInitialized,
} from '../shared/ShaderLibrary';
import { GpuSoftBodyProfiler, SB_SLOTS } from './Profiler';
import { PhysicsBodyState }               from '../../../scene/core/physics/PhysicsBodyState';
import type { PhysicsComputePass }        from '../../../scene/systems/PhysicsComputePass';
import type { GpuSimContext }             from '../../../scene/systems/GpuSimContext';
import type { EngineCore }               from '../../../core/interfaces/EngineCore';
import {
    SP_GRAVITY_X, SP_GRAVITY_Y, SP_GRAVITY_Z, SP_DT,
    SP_RESTITUTION, SP_DAMPING, SP_PARTICLE_RADIUS,
    SP_PARTICLE_COUNT, SP_CONSTRAINT_COUNT, SP_COLLIDER_COUNT,
    SP_SHAPE_STIFFNESS,
} from './SimParamsLayout';

type BodyBindGroups = {
    predict:              GPUBindGroup;
    distanceSolve:        GPUBindGroup;
    collision:            GPUBindGroup;
    velocityUpdate:       GPUBindGroup;
    vertexWrite:          GPUBindGroup;
    shapeMatchTransform?: GPUBindGroup;
    shapeCorrect?:        GPUBindGroup;
    distanceSolveColorBase?: GPUBindGroup;
    distanceSolveColorRanges?: GPUBindGroup[];
    colorCounts?: number[];
    jacobiSolve?: GPUBindGroup;
    jacobiApply?: GPUBindGroup;
};

export class SoftBodyXPBDComputePass implements PhysicsComputePass {

    public readonly passId = 'XPBDSoftBody';
    public readonly acceptedPhysicTypes: readonly string[] = ['SoftBody'];

    private core: EngineCore = WebGPUEngineCore.getInstance();
    private readonly uploader     = new ColliderDescriptorUploader();
    private readonly softProfiler: GpuSoftBodyProfiler;

    private ready        = false;
    private initPromise: Promise<void> | null = null;

    /** Bind groups cacheados por uuid do SoftBody. */
    private readonly bgCache = new Map<string, BodyBindGroups>();

    private readonly simParamsBuf = new ArrayBuffer(48);
    private readonly simParamsF32 = new Float32Array(this.simParamsBuf);
    private readonly simParamsU32 = new Uint32Array(this.simParamsBuf);

    constructor(
        private readonly globalForces:      Map<string, Force>,
        private readonly getSubsteps:       () => number,
        private readonly restitution:       number = 0.05,
        private readonly constraintIters:   number = 10,
        logInterval:                        number = 60,
    ) {
        this.softProfiler = new GpuSoftBodyProfiler(logInterval);
    }

    // ── PhysicsComputePass ────────────────────────────────────────────────────

    public ensureReady(core: EngineCore): Promise<void> {
        this.core = core;
        if (!this.initPromise) this.kickInit();
        return this.initPromise ?? Promise.resolve();
    }

    public dispose(): void {
        this.bgCache.clear();
    }

    public execute(context: GpuSimContext, dtFrame: number): void {
        if (!this.ready) {
            this.kickInit();
            return;
        }
        if (dtFrame <= 0) return;

        const substeps = this.getSubsteps();
        const dtSub    = dtFrame / substeps;

        const core    = this.core;
        const buffers = core.resources.buffers;
        const compute = core.compute;

        const colliderCount = this.uploader.upload(context);

        if (this.uploader.bufferRecreated) {
            this.bgCache.clear();
        }

        const encoders: GPUCommandEncoder[] = [];
        let firstBodyEncoded   = false;
        let doSoftProfileRead  = false;

        for (const { body, entity } of context.bodies.values()) {
            if (body.physicType !== 'SoftBody') continue;
            if (body.bodyState === PhysicsBodyState.Inactive) continue;

            const sb  = body as unknown as SoftBody;
            const geo = entity.getComponent<Geometry>('Geometry');
            if (!geo) continue;

            if (!sb.bufferSet) continue;

            const { particlesId, constraintsId, simParamsId } = sb.bufferSet;
            const pCount = sb.particles.length;
            const cCount = sb.constraints.length;

            if (pCount === 0) continue;

            if (!geo.currentResourceState.suppressCpuUpload() && geo.currentResourceState.canRender()) {
                geo.enterGpuManagedMode();
            }

            const mass    = body.get<number>('mass') ?? 1.0;
            const damping = body.get<number>('damping') ?? 0.01;
            const radius  = body.get<number>('particleRadius') ?? 0.05;

            let gx = 0, gy = 0, gz = 0;
            for (const force of this.globalForces.values()) {
                const f = force.compute(body, dtSub);
                gx += f[0]!; gy += f[1]!; gz += f[2]!;
            }
            const invMass = mass > 0 ? 1 / mass : 0;
            const ax = gx * invMass;
            const ay = gy * invMass;
            const az = gz * invMass;

            this.simParamsF32[SP_GRAVITY_X]       = ax;
            this.simParamsF32[SP_GRAVITY_Y]       = ay;
            this.simParamsF32[SP_GRAVITY_Z]       = az;
            this.simParamsF32[SP_DT]              = dtSub;
            this.simParamsF32[SP_RESTITUTION]     = this.restitution;
            this.simParamsF32[SP_DAMPING]         = damping;
            this.simParamsF32[SP_PARTICLE_RADIUS] = radius;
            this.simParamsU32[SP_PARTICLE_COUNT]  = pCount;
            this.simParamsU32[SP_CONSTRAINT_COUNT] = cCount;
            this.simParamsU32[SP_COLLIDER_COUNT]   = colliderCount;
            this.simParamsF32[SP_SHAPE_STIFFNESS]  = body.get<number>('shapeStiffness') ?? 0.0;

            buffers.writeBuffer(simParamsId, this.simParamsF32);

            let bg = this.bgCache.get(sb.uuid);
            if (!bg) {
                const useJacobiFlag = body.get<boolean>('useJacobiSolve') ?? false;
                const bs = sb.bufferSet;
                bg = this.buildBindGroups(
                    sb.uuid, simParamsId, particlesId, constraintsId, geo.vertexBufferId,
                    bs.colorRangeIds,
                    bs.colorCounts,
                    bs.lambdaBufId,
                    useJacobiFlag ? bs.jacobiAccumId : undefined,
                    bs.restPosId,
                    bs.goalPosId,
                    bs.shapeStateId,
                );
                this.bgCache.set(sb.uuid, bg);
            }

            const wg = Math.ceil(pCount / 64);
            try {
                const encoder = core.renderPasses.createCommandEncoder(`phys_gpu_${sb.uuid}`);

                const iters         = this.constraintIters;
                const useShapeM     = bg.shapeMatchTransform !== undefined;
                const useJacobi     = bg.jacobiSolve !== undefined && bg.jacobiApply !== undefined;
                const wgC           = Math.ceil(cCount / 64);
                const shouldProfile = !firstBodyEncoded && this.softProfiler.isActive;

                const lambdaEngBuf     = buffers.getBuffer(sb.bufferSet.lambdaBufId)!;
                const lambdaWarmEngBuf = buffers.getBuffer(sb.bufferSet.lambdaWarmId)!;
                const lambdaCopySize   = cCount * 4;

                for (let s = 0; s < substeps; s++) {
                    const profS0 = shouldProfile && s === 0;

                    const pass = compute.beginComputePassExplicit(
                        encoder, `phys_sub_${s}`,
                        profS0 ? this.softProfiler.timestampWritesFor(SB_SLOTS.predict) : undefined,
                    );
                    compute.dispatchOnPass(pass, PIPELINE_IDS.PREDICT, [bg.predict], wg);
                    if (useShapeM) {
                        compute.dispatchOnPass(pass, PIPELINE_IDS.SHAPE_MATCH_TRANSFORM, [bg.shapeMatchTransform!], 1);
                        compute.dispatchOnPass(pass, PIPELINE_IDS.SHAPE_CORRECT,         [bg.shapeCorrect!],        wg);
                    }
                    pass.end();

                    if (useJacobi) {
                        const jacobiAccumNative = buffers.getBuffer(sb.bufferSet.jacobiAccumId)!.native;
                        for (let it = 0; it < iters; it++) {
                            encoder.clearBuffer(jacobiAccumNative, 0, pCount * 16);

                            const solvePass = compute.beginComputePassExplicit(
                                encoder, `phys_jac_solve_${s}_${it}`,
                                profS0 && it === 0 ? this.softProfiler.timestampWritesFor(SB_SLOTS.constraints) : undefined,
                            );
                            compute.dispatchOnPass(solvePass, PIPELINE_IDS.DISTANCE_SOLVE_JACOBI, [bg.jacobiSolve!], wgC);
                            solvePass.end();

                            const applyPass = compute.beginComputePassExplicit(encoder, `phys_jac_apply_${s}_${it}`);
                            compute.dispatchOnPass(applyPass, PIPELINE_IDS.JACOBI_APPLY, [bg.jacobiApply!], wg);
                            applyPass.end();
                        }
                    } else if (bg.distanceSolveColorBase && bg.distanceSolveColorRanges && bg.colorCounts) {
                        core.copy.copyBufferToBuffer(encoder, lambdaWarmEngBuf, lambdaEngBuf, lambdaCopySize);

                        const colorPass = compute.beginComputePassExplicit(
                            encoder, `phys_color_${s}`,
                            profS0 ? this.softProfiler.timestampWritesFor(SB_SLOTS.constraints) : undefined,
                        );
                        for (let it = 0; it < iters; it++) {
                            for (let c = 0; c < bg.distanceSolveColorRanges.length; c++) {
                                compute.dispatchOnPass(
                                    colorPass,
                                    PIPELINE_IDS.DISTANCE_SOLVE_COLOR,
                                    [bg.distanceSolveColorBase, bg.distanceSolveColorRanges[c]!],
                                    Math.ceil(bg.colorCounts[c]! / 64),
                                );
                            }
                        }
                        colorPass.end();

                        if (s === substeps - 1) {
                            core.copy.copyBufferToBuffer(encoder, lambdaEngBuf, lambdaWarmEngBuf, lambdaCopySize);
                        }
                    } else {
                        const serialPass = compute.beginComputePassExplicit(
                            encoder, `phys_serial_${s}`,
                            profS0 ? this.softProfiler.timestampWritesFor(SB_SLOTS.constraints) : undefined,
                        );
                        for (let it = 0; it < iters; it++) {
                            compute.dispatchOnPass(serialPass, PIPELINE_IDS.DISTANCE_SOLVE, [bg.distanceSolve], 1);
                        }
                        serialPass.end();
                    }

                    const collPass = compute.beginComputePassExplicit(
                        encoder, `phys_coll_${s}`,
                        profS0 ? this.softProfiler.timestampWritesFor(SB_SLOTS.collision) : undefined,
                    );
                    compute.dispatchOnPass(collPass, PIPELINE_IDS.COLLISION, [bg.collision], wg);
                    collPass.end();

                    const velPass = compute.beginComputePassExplicit(
                        encoder, `phys_vel_${s}`,
                        profS0 ? this.softProfiler.timestampWritesFor(SB_SLOTS.velocity) : undefined,
                    );
                    compute.dispatchOnPass(velPass, PIPELINE_IDS.VELOCITY_UPDATE, [bg.velocityUpdate], wg);
                    velPass.end();
                }

                const vwPass = compute.beginComputePassExplicit(
                    encoder, 'phys_vertex_write',
                    shouldProfile ? this.softProfiler.timestampWritesFor(SB_SLOTS.vertexWrite) : undefined,
                );
                compute.dispatchOnPass(vwPass, PIPELINE_IDS.VERTEX_WRITE, [bg.vertexWrite], wg);
                vwPass.end();

                if (shouldProfile) doSoftProfileRead = this.softProfiler.encodeResolve(encoder);

                encoders.push(encoder);
                firstBodyEncoded = true;
            } catch (err) {
                console.error(`[SoftBodyXPBDComputePass] encode falhou para corpo ${sb.uuid}:`, err);
                this.bgCache.delete(sb.uuid);
            }
        }

        if (encoders.length > 0) {
            core.renderPasses.submit(encoders);
            if (doSoftProfileRead) this.softProfiler.startRead();
        }
    }

    // ── Privado ───────────────────────────────────────────────────────────────

    private kickInit(): void {
        if (this.initPromise) return;
        this.initPromise = ensurePhysicsPipelinesInitialized(this.core)
            .then(() => { this.ready = true; })
            .catch(err => { console.error('[SoftBodyXPBDComputePass] pipeline init falhou:', err); });
    }

    private buildBindGroups(
        uuid:            string,
        simParamsId:     string,
        particlesId:     string,
        constraintsId:   string,
        vertexBufId:     string,
        colorRangeIds:   string[],
        colorCounts:     number[],
        lambdaBufId:     string | undefined,
        jacobiAccumId:   string | undefined,
        restPosId?:      string,
        goalPosId?:      string,
        shapeStateId?:   string,
    ): BodyBindGroups {
        const compute = this.core.compute;
        const bufs    = this.core.resources.buffers;

        const simParamsBuf   = bufs.getBuffer(simParamsId)!.native;
        const particlesBuf   = bufs.getBuffer(particlesId)!.native;
        const constraintsBuf = bufs.getBuffer(constraintsId)!.native;
        const collidersBuf   = bufs.getBuffer(COLLIDERS_BUFFER_ID)!.native;
        const vertexBuf      = bufs.getBuffer(vertexBufId)!.native;

        const bg = (id: string, entries: GPUBindGroupEntry[]) =>
            compute.createBindGroupFromPipeline(id, 0, entries, `bg_${id}_${uuid}`);

        const predict = bg(PIPELINE_IDS.PREDICT, [
            { binding: 0, resource: { buffer: simParamsBuf } },
            { binding: 1, resource: { buffer: particlesBuf } },
        ]);

        const distanceSolve = bg(PIPELINE_IDS.DISTANCE_SOLVE, [
            { binding: 0, resource: { buffer: simParamsBuf } },
            { binding: 1, resource: { buffer: particlesBuf } },
            { binding: 2, resource: { buffer: constraintsBuf } },
        ]);

        const collision = bg(PIPELINE_IDS.COLLISION, [
            { binding: 0, resource: { buffer: simParamsBuf } },
            { binding: 1, resource: { buffer: particlesBuf } },
            { binding: 2, resource: { buffer: collidersBuf } },
        ]);

        const velocityUpdate = bg(PIPELINE_IDS.VELOCITY_UPDATE, [
            { binding: 0, resource: { buffer: simParamsBuf } },
            { binding: 1, resource: { buffer: particlesBuf } },
        ]);

        const vertexWrite = bg(PIPELINE_IDS.VERTEX_WRITE, [
            { binding: 0, resource: { buffer: simParamsBuf } },
            { binding: 1, resource: { buffer: particlesBuf } },
            { binding: 2, resource: { buffer: vertexBuf } },
        ]);

        let shapeMatchTransform: GPUBindGroup | undefined;
        let shapeCorrect: GPUBindGroup | undefined;

        if (restPosId && goalPosId && shapeStateId) {
            const restPosBuf    = bufs.getBuffer(restPosId)!.native;
            const goalPosBuf    = bufs.getBuffer(goalPosId)!.native;
            const shapeStateBuf = bufs.getBuffer(shapeStateId)!.native;

            shapeMatchTransform = bg(PIPELINE_IDS.SHAPE_MATCH_TRANSFORM, [
                { binding: 0, resource: { buffer: simParamsBuf } },
                { binding: 1, resource: { buffer: particlesBuf } },
                { binding: 2, resource: { buffer: restPosBuf } },
                { binding: 3, resource: { buffer: goalPosBuf } },
                { binding: 4, resource: { buffer: shapeStateBuf } },
            ]);

            shapeCorrect = bg(PIPELINE_IDS.SHAPE_CORRECT, [
                { binding: 0, resource: { buffer: simParamsBuf } },
                { binding: 1, resource: { buffer: particlesBuf } },
                { binding: 2, resource: { buffer: goalPosBuf } },
            ]);
        }

        let distanceSolveColorBase: GPUBindGroup | undefined;
        let distanceSolveColorRanges: GPUBindGroup[] | undefined;

        if (colorRangeIds.length > 0 && lambdaBufId) {
            const lambdaBuf = bufs.getBuffer(lambdaBufId)!.native;

            distanceSolveColorBase = compute.createBindGroupFromPipeline(
                PIPELINE_IDS.DISTANCE_SOLVE_COLOR, 0,
                [
                    { binding: 0, resource: { buffer: simParamsBuf } },
                    { binding: 1, resource: { buffer: particlesBuf } },
                    { binding: 2, resource: { buffer: constraintsBuf } },
                    { binding: 3, resource: { buffer: lambdaBuf } },
                ],
                `bg_ds_color_base_${uuid}`,
            );

            distanceSolveColorRanges = colorRangeIds.map((rangeId, c) =>
                compute.createBindGroupFromPipeline(
                    PIPELINE_IDS.DISTANCE_SOLVE_COLOR, 1,
                    [{ binding: 0, resource: { buffer: bufs.getBuffer(rangeId)!.native } }],
                    `bg_ds_color_range_${c}_${uuid}`,
                )
            );
        }

        let jacobiSolve: GPUBindGroup | undefined;
        let jacobiApply: GPUBindGroup | undefined;

        if (jacobiAccumId) {
            const accumBuf = bufs.getBuffer(jacobiAccumId)!.native;

            jacobiSolve = compute.createBindGroupFromPipeline(
                PIPELINE_IDS.DISTANCE_SOLVE_JACOBI, 0,
                [
                    { binding: 0, resource: { buffer: simParamsBuf } },
                    { binding: 1, resource: { buffer: particlesBuf } },
                    { binding: 2, resource: { buffer: constraintsBuf } },
                    { binding: 3, resource: { buffer: accumBuf } },
                ],
                `bg_jacobi_solve_${uuid}`,
            );

            jacobiApply = compute.createBindGroupFromPipeline(
                PIPELINE_IDS.JACOBI_APPLY, 0,
                [
                    { binding: 0, resource: { buffer: simParamsBuf } },
                    { binding: 1, resource: { buffer: particlesBuf } },
                    { binding: 2, resource: { buffer: accumBuf } },
                ],
                `bg_jacobi_apply_${uuid}`,
            );
        }

        return {
            predict, distanceSolve, collision, velocityUpdate, vertexWrite,
            ...(shapeMatchTransform       ? { shapeMatchTransform }       : {}),
            ...(shapeCorrect             ? { shapeCorrect }              : {}),
            ...(distanceSolveColorBase   ? { distanceSolveColorBase }   : {}),
            ...(distanceSolveColorRanges ? { distanceSolveColorRanges } : {}),
            ...(colorCounts.length > 0   ? { colorCounts }              : {}),
            ...(jacobiSolve              ? { jacobiSolve }              : {}),
            ...(jacobiApply              ? { jacobiApply }              : {}),
        };
    }
}
