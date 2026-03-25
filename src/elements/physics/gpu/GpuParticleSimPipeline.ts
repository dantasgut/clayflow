/**
 * GpuParticleSimPipeline — pipeline GPU para simulação de partículas XPBD.
 *
 * Estágio de nível de frame (não por substep). Recebe dt_frame e executa
 * internamente N substeps via compute shaders, substituindo os 6 estágios
 * CPU do pipeline SoftBody para corpos com backend='gpu'.
 *
 * ## Sequência por frame
 *
 * ```
 * Para cada SoftBody com gpuSimulated=true:
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
 * ## Bind Groups
 *
 * Cada kernel tem um bind group 0 com o subconjunto de buffers que usa.
 * Bind groups são criados na primeira execução após a alocação e cacheados.
 *
 * ## Inicialização assíncrona
 *
 * Os pipelines WGSL são compilados assincronamente via ensurePhysicsPipelinesInitialized().
 * Nos frames anteriores à conclusão, execute() retorna sem fazer nada (skip frame seguro).
 *
 * Arquitetura: Layer 3 → Facade Layer 1 (WebGPUEngineCore.getInstance()).
 */

import { WebGPUEngineCore }          from '../../../core/WebGPUEngineCore';
import type { PhysicsStage }          from '../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext }   from '../../../scene/systems/PhysicsStageContext';
import type { SoftBody }              from '../SoftBody';
import type { Force }                 from '../../../scene/systems/forces/Force';
import type { Geometry }              from '../../../scene/components/Geometry';
import { ResourceState }              from '../../../scene/core/ResourceState';
import { SimBodyBufferAllocator }     from './SimBodyBufferAllocator';
import { ColliderDescriptorUploader, COLLIDERS_BUFFER_ID } from './ColliderDescriptorUploader';
import {
    PIPELINE_IDS,
    ensurePhysicsPipelinesInitialized,
} from './PhysicsShaderLibrary';
import { GpuSoftBodyProfiler, SB_SLOTS } from './GpuSoftBodyProfiler';

// SimParams layout offset map (float indices into the 48-byte uniform buffer)
const SP_GRAVITY_X        = 0;
const SP_GRAVITY_Y        = 1;
const SP_GRAVITY_Z        = 2;
const SP_DT               = 3;
const SP_RESTITUTION      = 4;
const SP_DAMPING          = 5;
const SP_PARTICLE_RADIUS  = 6;
// u32 fields — same ArrayBuffer, different view
const SP_PARTICLE_COUNT   = 7;   // u32 view index
const SP_CONSTRAINT_COUNT = 8;   // u32 view index
const SP_COLLIDER_COUNT   = 9;   // u32 view index
// f32 — shape_stiffness (replaced _pad at index 10)
const SP_SHAPE_STIFFNESS  = 10;  // f32 view index

type BodyBindGroups = {
    predict:              GPUBindGroup;
    distanceSolve:        GPUBindGroup;
    collision:            GPUBindGroup;
    velocityUpdate:       GPUBindGroup;
    vertexWrite:          GPUBindGroup;
    shapeMatchTransform?: GPUBindGroup;   // presente quando useShapeMatching=true
    shapeCorrect?:        GPUBindGroup;   // presente quando useShapeMatching=true
    // Graph coloring (Fase 3a) — presentes quando colorRangeIds não estiver vazio
    distanceSolveColorBase?: GPUBindGroup;    // group 0: simParams + particles + constraints
    distanceSolveColorRanges?: GPUBindGroup[]; // group 1 por cor: ColorRange uniform
    colorCounts?: number[];                   // constraints por cor (para ceil/64)
    // Jacobi XPBD (Fase 3d) — presentes quando useJacobiSolve=true
    jacobiSolve?: GPUBindGroup;   // simParams + particles(read) + constraints + accum
    jacobiApply?: GPUBindGroup;   // simParams + particles(read_write) + accum
};

export class GpuParticleSimPipeline implements PhysicsStage {

    private readonly core         = WebGPUEngineCore.getInstance();
    private readonly allocator    = new SimBodyBufferAllocator();
    private readonly uploader     = new ColliderDescriptorUploader();
    private readonly softProfiler = new GpuSoftBodyProfiler();

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
    ) {}

    // ── PhysicsStage ──────────────────────────────────────────────────────────

    public execute(context: PhysicsStageContext, dtFrame: number): void {
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

        // Empacota e envia ColliderDescs (uma vez por frame, todos os corpos)
        const colliderCount = this.uploader.upload(context);

        // Invalida bind groups de todos os corpos se o buffer de colliders foi recriado (paridade com GpuRigidBodyPipeline)
        if (this.uploader.bufferRecreated) {
            this.bgCache.clear();
        }

        // Otimização 1c: acumula encoders de todos os corpos e faz 1 submit total
        const encoders: GPUCommandEncoder[] = [];
        let firstBodyEncoded   = false;  // flag de profiling: mede apenas o primeiro body
        let doSoftProfileRead  = false;  // true se encodeResolve encodou — startRead após submit

        for (const { body, entity } of context.bodies.values()) {
            if (body.physicType !== 'SoftBody') continue;
            if (!body.get<boolean>('gpuSimulated')) continue;

            const sb  = body as unknown as SoftBody;
            const geo = entity.getComponent<Geometry>('Geometry');
            if (!geo) continue;

            // Lazy buffer allocation — aguarda Geometry estar Ready
            if (!body.get<boolean>('gpuBuffersAllocated')) {
                if (geo.state !== ResourceState.Ready) continue;
                this.allocator.allocate(sb);
            }

            const particlesId   = body.get<string>('gpuParticlesId')!;
            const constraintsId = body.get<string>('gpuConstraintsId')!;
            const simParamsId   = body.get<string>('gpuSimParamsId')!;
            const pCount        = sb.particles.length;
            const cCount        = sb.constraints.length;

            if (pCount === 0) continue;

            // Entra em modo GPU-managed na Geometry (uma vez)
            if (!geo.isGpuManaged && geo.state === ResourceState.Ready) {
                geo.enterGpuManagedMode();
            }

            // ── SimParams ──────────────────────────────────────────────────────
            // Gravidade: acumula forças via force.compute() e divide pela massa,
            // replicando XPBDSoftBodySolver.solve() — garante que o GPU e CPU
            // usem a mesma aceleração independente do valor de mass do corpo.
            const mass    = body.get<number>('mass') ?? 1.0;
            const damping = body.get<number>('damping') ?? 0.01;
            const radius  = body.get<number>('particleRadius') ?? 0.05;

            let gx = 0, gy = 0, gz = 0;
            for (const force of this.globalForces.values()) {
                const f = force.compute(body, dtSub);
                gx += f[0]!; gy += f[1]!; gz += f[2]!;
            }
            // Converte força → aceleração (replica: ax = netForce / mass)
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

            // ── Bind groups (lazy, cacheados) ──────────────────────────────────
            let bg = this.bgCache.get(sb.uuid);
            if (!bg) {
                // Passa jacobiAccumId apenas se o corpo optou por Jacobi (Fase 3d)
                const useJacobiFlag = body.get<boolean>('useJacobiSolve') ?? false;
                bg = this.buildBindGroups(
                    sb.uuid, simParamsId, particlesId, constraintsId, geo.vertexBufferId,
                    body.get<string[]>('gpuColorRangeIds') ?? [],
                    body.get<number[]>('gpuColorCounts')   ?? [],
                    body.get<string>('gpuLambdaBufId'),
                    useJacobiFlag ? body.get<string>('gpuJacobiAccumId') : undefined,
                    body.get<string>('gpuRestPosId'),
                    body.get<string>('gpuGoalPosId'),
                    body.get<string>('gpuShapeStateId'),
                );
                this.bgCache.set(sb.uuid, bg);
            }

            // ── Encode ─────────────────────────────────────────────────────────
            // try/catch isola falhas por corpo: um encoder inválido não cancela os demais (1c)
            const wg = Math.ceil(pCount / 64);
            try {
                const encoder = core.renderPasses.createCommandEncoder(`phys_gpu_${sb.uuid}`);

                const iters         = this.constraintIters;
                const useShapeM     = bg.shapeMatchTransform !== undefined;
                const useJacobi     = bg.jacobiSolve !== undefined && bg.jacobiApply !== undefined;
                const wgC           = Math.ceil(cCount / 64);
                const shouldProfile = !firstBodyEncoded && this.softProfiler.isActive;

                // Fix #5: buffers de warm-start λ inter-frames (graph coloring path)
                const lambdaEngBuf     = buffers.getBuffer(body.get<string>('gpuLambdaBufId')!)!;
                const lambdaWarmEngBuf = buffers.getBuffer(body.get<string>('gpuLambdaWarmId')!)!;
                const lambdaCopySize   = cCount * 4;  // f32 por constraint

                for (let s = 0; s < substeps; s++) {
                    const profS0 = shouldProfile && s === 0;

                    const pass = compute.beginComputePassExplicit(
                        encoder, `phys_sub_${s}`,
                        profS0 ? this.softProfiler.timestampWritesFor(SB_SLOTS.predict) : undefined,
                    );
                    compute.dispatchOnPass(pass, PIPELINE_IDS.PREDICT, [bg.predict], wg);
                    // Shape Matching: extrai rotação e aplica correção antes das constraints
                    if (useShapeM) {
                        compute.dispatchOnPass(pass, PIPELINE_IDS.SHAPE_MATCH_TRANSFORM, [bg.shapeMatchTransform!], 1);
                        compute.dispatchOnPass(pass, PIPELINE_IDS.SHAPE_CORRECT,         [bg.shapeCorrect!],        wg);
                    }
                    pass.end();

                    if (useJacobi) {
                        // Fase 3d: Jacobi XPBD — solve + apply em passes separados por iteração.
                        // Barreira implícita entre passes garante que o acúmulo está completo.
                        const jacobiAccumNative = buffers.getBuffer(body.get<string>('gpuJacobiAccumId')!)!.native;
                        for (let it = 0; it < iters; it++) {
                            // Limpa accum antes de cada solve (mais eficiente que atomicStore no shader)
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
                        // Fase 3a: graph coloring — paralelo por cor; sem barreira entre cores
                        // (cores não compartilham partículas → sem data race por design)

                        // Restaura λ do warm-start (valor do frame anterior) — warm-starting estritamente inter-frame
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
                            // Salva λ final como warm-start para o próximo frame
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

                    // Barreira implícita garante que COLLISION terminou antes de VELOCITY_UPDATE ler pred
                    const velPass = compute.beginComputePassExplicit(
                        encoder, `phys_vel_${s}`,
                        profS0 ? this.softProfiler.timestampWritesFor(SB_SLOTS.velocity) : undefined,
                    );
                    compute.dispatchOnPass(velPass, PIPELINE_IDS.VELOCITY_UPDATE, [bg.velocityUpdate], wg);
                    velPass.end();
                }

                // Vertex write — uma vez por frame após todos os substeps
                const vwPass = compute.beginComputePassExplicit(
                    encoder, 'phys_vertex_write',
                    shouldProfile ? this.softProfiler.timestampWritesFor(SB_SLOTS.vertexWrite) : undefined,
                );
                compute.dispatchOnPass(vwPass, PIPELINE_IDS.VERTEX_WRITE, [bg.vertexWrite], wg);
                vwPass.end();

                // Encoda resolveQueriesRange + copyBufferToBuffer; mapAsync só após submit
                if (shouldProfile) doSoftProfileRead = this.softProfiler.encodeResolve(encoder);

                encoders.push(encoder);
                firstBodyEncoded = true;
            } catch (err) {
                console.error(`[GpuParticleSimPipeline] encode falhou para corpo ${sb.uuid}:`, err);
                this.bgCache.delete(sb.uuid);  // invalida cache para recriar no próximo frame
            }
        }

        // Submit único para todos os corpos do frame (Otimização 1c)
        if (encoders.length > 0) {
            core.renderPasses.submit(encoders);
            // mapAsync DEVE ser chamado APÓS submit — buffer em estado 'pending' bloqueia o submit
            if (doSoftProfileRead) this.softProfiler.startRead();
        }
    }

    // ── Privado ───────────────────────────────────────────────────────────────

    private kickInit(): void {
        if (this.initPromise) return;
        this.initPromise = ensurePhysicsPipelinesInitialized(this.core)
            .then(() => { this.ready = true; })
            .catch(err => { console.error('[GpuParticleSimPipeline] pipeline init falhou:', err); });
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

        // Usa createBindGroupFromPipeline() — compatível com o auto-layout do pipeline
        // (pipeline criado com layout:'auto' via createComputePipelineAsync).
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

        // ── Shape Matching (opcional) ─────────────────────────────────────────
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

        // ── Graph Coloring bind groups (Fase 3a) ──────────────────────────────
        let distanceSolveColorBase: GPUBindGroup | undefined;
        let distanceSolveColorRanges: GPUBindGroup[] | undefined;

        if (colorRangeIds.length > 0 && lambdaBufId) {
            const lambdaBuf = bufs.getBuffer(lambdaBufId)!.native;

            // group 0: simParams + particles + constraints + lambdas (warm-starting)
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

            // group 1: um bind group por cor com o ColorRange uniform
            distanceSolveColorRanges = colorRangeIds.map((rangeId, c) =>
                compute.createBindGroupFromPipeline(
                    PIPELINE_IDS.DISTANCE_SOLVE_COLOR, 1,
                    [{ binding: 0, resource: { buffer: bufs.getBuffer(rangeId)!.native } }],
                    `bg_ds_color_range_${c}_${uuid}`,
                )
            );
        }

        // ── Jacobi bind groups (Fase 3d) ──────────────────────────────────────
        let jacobiSolve: GPUBindGroup | undefined;
        let jacobiApply: GPUBindGroup | undefined;

        if (jacobiAccumId) {
            const accumBuf = bufs.getBuffer(jacobiAccumId)!.native;

            // group 0: simParams + particles(read) + constraints(read) + accum(read_write)
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

            // group 0: simParams + particles(read_write) + accum(read_write)
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
