/**
 * GpuRigidBodyPipeline — pipeline GPU para simulação de corpos rígidos XPBD.
 *
 * Estágio de nível de frame (não por substep). Recebe dt_frame e executa
 * internamente rb_predict + N substeps + rb_velocity_recovery via compute shaders.
 *
 * ## Sequência por frame
 *
 * ```
 * 1. upload colliders (ColliderDescriptorUploader)
 * 2. allocate/realoca buffers se necessário (RigidBodyBufferAllocator)
 * 3. writeSimParams — atualiza RBSimParams uniform
 * 4. Cria GPUCommandEncoder
 *    4a. rb_predict (1×, ANTES do substep loop)
 *    Para cada substep:
 *      4b. rb_narrowphase (1×)
 *      4c. rb_solve (K vezes, serial)
 *    4e. rb_velocity_recovery (1×, APÓS o substep loop)
 * 5. submit encoder
 * ```
 *
 * ## Buffer global único
 *
 * Diferente do SoftBody (um buffer por corpo), todos os RigidBodies compartilham
 * um único buffer `gpu_rb_bodies`. Isso permite que rb_solve acesse corpos por índice.
 *
 * ## Bind groups
 *
 * Cada kernel tem um bind group 0 cacheado. O cache é invalidado quando
 * ColliderDescriptorUploader recria o buffer de colliders (bufferRecreated=true).
 *
 * Arquitetura: Layer 3 → Facade Layer 1 (WebGPUEngineCore.getInstance()).
 */

import { WebGPUEngineCore }          from '../../../core/WebGPUEngineCore';
import { WebGPUContext }             from '../../../core/context/WebGPUContext';
import type { PhysicsStage }          from '../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext }   from '../../../scene/systems/PhysicsStageContext';
import type { Force }                 from '../../../scene/systems/forces/Force';
import type { RigidBody }             from '../RigidBody';
import { ColliderDescriptorUploader, COLLIDERS_BUFFER_ID } from './ColliderDescriptorUploader';
import {
    RigidBodyBufferAllocator,
    RB_BODIES_BUFFER_ID,
    RB_SIM_PARAMS_BUFFER_ID,
    RB_CONTACTS_BUFFER_ID,
    RB_TO_UBO_MAP_BUFFER_ID,
} from './RigidBodyBufferAllocator';
import {
    PIPELINE_IDS,
    ensurePhysicsPipelinesInitialized,
} from './PhysicsShaderLibrary';
import { GpuPhysicsProfiler, PHYS_SLOTS } from './GpuPhysicsProfiler';

// RBSimParams layout (float/u32 indices into the 64-byte uniform buffer)
// gravity (vec4f): indices 0-3 (xyz=accel, w=dt_substep)
// body_count: u32 index 4 | collider_count: u32 index 5 | max_contacts: u32 index 6 | solve_iters: u32 index 7
// dt_frame: f32 index 8 | _pad1a..c: f32 indices 9-11
const SP_GRAVITY_X      = 0;
const SP_GRAVITY_Y      = 1;
const SP_GRAVITY_Z      = 2;
const SP_DT             = 3;   // dtSub = dt_frame / substeps
const SP_BODY_COUNT     = 4;   // u32 view index
const SP_COLLIDER_COUNT = 5;   // u32 view index
const SP_MAX_CONTACTS   = 6;   // u32 view index
const SP_SOLVE_ITERS    = 7;   // u32 view index
const SP_DT_FRAME       = 8;   // f32: dt do frame inteiro (= dtSub * substeps)

type RbBindGroups = {
    predict:          GPUBindGroup;
    narrowphase:      GPUBindGroup;
    solve:            GPUBindGroup;
    velocityRecovery: GPUBindGroup;
    syncTransform:    GPUBindGroup | null;  // Criado em syncToRenderer (precisa do UBO buffer)
};

export class GpuRigidBodyPipeline implements PhysicsStage {

    private readonly core      = WebGPUEngineCore.getInstance();
    private readonly allocator = new RigidBodyBufferAllocator();
    private readonly uploader  = new ColliderDescriptorUploader();
    private readonly phyProfiler = new GpuPhysicsProfiler();

    private ready        = false;
    private initPromise: Promise<void> | null = null;

    /** Buffer de staging MAP_READ para leitura assíncrona das posições GPU → CPU. */
    private readbackBuffer: GPUBuffer | null = null;
    private readbackBodyCount = 0;
    private readbackPending   = false;

    /** Bind groups cacheados (um conjunto global — todos os corpos num buffer único). */
    private bgCache: RbBindGroups | null = null;

    /** Lista ordenada de corpos GPU-simulados — determina o índice gpuRbIndex. */
    private gpuBodies: RigidBody[] = [];

    /** entity.id de cada corpo na posição gpuRbIndex — para montar o mapeamento UBO. */
    private gpuEntityIds: number[] = [];

    /** Número de colliders na última alocação — detecta necessidade de realocação. */
    private lastColliderCount = -1;

    /** Número de corpos na última alocação — detecta necessidade de realocação. */
    private lastBodyCount = -1;

    private readonly rbSimParamsBuf = new ArrayBuffer(64);
    private readonly rbSimParamsF32 = new Float32Array(this.rbSimParamsBuf);
    private readonly rbSimParamsU32 = new Uint32Array(this.rbSimParamsBuf);

    /** Cache do frame anterior para detecção de mudanças nos SimParams (Otimização 3e). */
    private readonly prevSimParamsF32 = new Float32Array(16);

    /** Buffer temporário para upload do mapeamento gpuRbIndex→uboSlot. */
    private readonly uboMapData = new Uint32Array(256);  // realloca se necessário

    constructor(
        private readonly globalForces:    Map<string, Force>,
        private readonly getSubsteps:     () => number,
        private readonly solveIterations: number = 10,
    ) {}

    // ── PhysicsStage ──────────────────────────────────────────────────────────

    public execute(context: PhysicsStageContext, dtFrame: number): void {
        if (!this.ready) {
            this.kickInit();
            return;
        }
        if (dtFrame <= 0) return;

        // Coleta todos os corpos GPU-simulados do contexto
        const newBodies:    RigidBody[] = [];
        const newEntityIds: number[]    = [];
        for (const { body, entity } of context.bodies.values()) {
            if (body.physicType !== 'RigidBody') continue;
            if (!body.get<boolean>('gpuSimulated')) continue;
            newBodies.push(body as unknown as RigidBody);
            newEntityIds.push(entity.id);
        }

        if (newBodies.length === 0) return;

        // GPU XPBD usa 1 substep com K ampliado para equivalência:
        // rb_predict roda antes do loop e pos_pred não é comitado entre substeps,
        // portanto substeps>1 causaria amplificação de velocidade em velocity_recovery.
        // Qualidade compensada: K_gpu = solveIterations * physicsSubsteps (≥ 40 iters).
        const substeps = 1;
        const dtSub    = dtFrame; // dtSub = dtFrame com substeps=1

        const core    = this.core;
        const buffers = core.resources.buffers;
        const compute = core.compute;

        // Empacota e envia ColliderDescs (uma vez por frame)
        const colliderCount = this.uploader.upload(context);

        // Detecta mudança no conjunto de corpos ou colliders — realoca se necessário
        const bodyCountChanged     = newBodies.length !== this.lastBodyCount;
        const colliderCountChanged = colliderCount !== this.lastColliderCount;

        if (bodyCountChanged || colliderCountChanged) {
            this.gpuBodies    = newBodies;
            this.gpuEntityIds = newEntityIds;
            this.allocator.allocate(this.gpuBodies, colliderCount);
            this.lastBodyCount     = newBodies.length;
            this.lastColliderCount = colliderCount;
            this.bgCache = null;  // invalida bind groups
        }

        // Invalida bind groups se o buffer de colliders foi recriado
        if (this.uploader.bufferRecreated) {
            this.bgCache = null;
        }

        const bodyCount   = this.gpuBodies.length;
        const maxContacts = bodyCount * Math.max(colliderCount, 1);

        // ── RBSimParams ────────────────────────────────────────────────────────
        let gx = 0, gy = 0, gz = 0;
        for (const force of this.globalForces.values()) {
            // ConstantForce.compute() retorna aceleração diretamente (não força).
            // O shader aplica gravity*dt à velocidade sem dividir por massa.
            // Divisão por invM estava errada: para kinematic (mass=0) gerava gravity=0.
            const f = force.compute(this.gpuBodies[0]!, dtSub);
            gx += f[0] ?? 0;
            gy += f[1] ?? 0;
            gz += f[2] ?? 0;
        }

        // K ampliado: compensa o colapso para 1 substep mantendo qualidade total de solve
        const K = this.solveIterations * this.getSubsteps();  // ex: 10 × 4 = 40 iters

        this.rbSimParamsF32[SP_GRAVITY_X]      = gx;
        this.rbSimParamsF32[SP_GRAVITY_Y]      = gy;
        this.rbSimParamsF32[SP_GRAVITY_Z]      = gz;
        this.rbSimParamsF32[SP_DT]             = dtSub;
        this.rbSimParamsU32[SP_BODY_COUNT]     = bodyCount;
        this.rbSimParamsU32[SP_COLLIDER_COUNT] = colliderCount;
        this.rbSimParamsU32[SP_MAX_CONTACTS]   = maxContacts;
        this.rbSimParamsU32[SP_SOLVE_ITERS]    = K;
        this.rbSimParamsF32[SP_DT_FRAME]       = dtFrame;  // dt_frame para velocity_recovery

        // Otimização 3e: só envia SimParams se algo mudou em relação ao frame anterior
        let simParamsDirty = false;
        for (let i = 0; i < 16; i++) {
            if (this.rbSimParamsF32[i] !== this.prevSimParamsF32[i]) {
                simParamsDirty = true;
                break;
            }
        }
        if (simParamsDirty) {
            buffers.writeBuffer(RB_SIM_PARAMS_BUFFER_ID, this.rbSimParamsF32);
            this.prevSimParamsF32.set(this.rbSimParamsF32);
        }

        // ── Bind groups (lazy, cacheados) ──────────────────────────────────────
        if (!this.bgCache) {
            this.bgCache = this.buildBindGroups();
        }

        const bg = this.bgCache;

        // ── Encode ─────────────────────────────────────────────────────────────
        const wgBodies   = Math.ceil(bodyCount / 64);
        const wgContacts = Math.ceil(maxContacts / 64);

        try {
            const encoder  = core.renderPasses.createCommandEncoder('phys_rb_gpu');
            const profiler = this.phyProfiler;

            // rb_predict — 1× por frame, antes do loop de substeps
            const predictPass = compute.beginComputePassExplicit(
                encoder, 'rb_predict', profiler.timestampWritesFor(PHYS_SLOTS.predict));
            compute.dispatchOnPass(predictPass, PIPELINE_IDS.RB_PREDICT, [bg.predict], wgBodies);
            predictPass.end();

            // Substep loop — narrowphase e solve são cronometrados apenas no substep 0 (amostra representativa)
            for (let s = 0; s < substeps; s++) {
                const isFirstSub = s === 0;

                // rb_narrowphase — 1× por substep
                const npPass = compute.beginComputePassExplicit(
                    encoder, `rb_narrowphase_${s}`,
                    isFirstSub ? profiler.timestampWritesFor(PHYS_SLOTS.narrowphase) : undefined);
                compute.dispatchOnPass(npPass, PIPELINE_IDS.RB_NARROWPHASE, [bg.narrowphase], wgContacts);
                npPass.end();

                // rb_solve — 1 dispatch por substep; loop K está dentro do shader (Otimização 1a+)
                const solvePass = compute.beginComputePassExplicit(
                    encoder, `rb_solve_${s}`,
                    isFirstSub ? profiler.timestampWritesFor(PHYS_SLOTS.solve) : undefined);
                compute.dispatchOnPass(solvePass, PIPELINE_IDS.RB_SOLVE, [bg.solve], 1);
                solvePass.end();
            }

            // rb_velocity_recovery — 1× por frame, após o loop de substeps
            const vrPass = compute.beginComputePassExplicit(
                encoder, 'rb_velocity_recovery', profiler.timestampWritesFor(PHYS_SLOTS.velocityRecovery));
            compute.dispatchOnPass(vrPass, PIPELINE_IDS.RB_VELOCITY_RECOVERY, [bg.velocityRecovery], wgBodies);
            vrPass.end();

            // Encoda copyBufferToBuffer (gpu_rb_bodies → staging); mapAsync só após submit
            const doReadback     = this.encodePositionReadback(encoder, bodyCount);
            // Encoda resolveQuerySet + copyBufferToBuffer do profiler; mapAsync só após submit
            const doProfileRead  = profiler.encodeResolve(encoder);

            core.renderPasses.submit([encoder]);

            // mapAsync DEVE ser chamado APÓS submit — buffer em estado 'pending' bloqueia o submit
            if (doReadback)    this.startReadbackMap();
            if (doProfileRead) profiler.startRead();
        } catch (err) {
            console.error('[GpuRigidBodyPipeline] encode falhou:', err);
            this.bgCache = null;  // invalida bind groups para recriar no próximo frame
        }
    }

    // ── Privado ───────────────────────────────────────────────────────────────

    private kickInit(): void {
        if (this.initPromise) return;
        this.initPromise = ensurePhysicsPipelinesInitialized(this.core)
            .then(() => {
                this.ready = true;
                console.info('[GpuRigidBodyPipeline] pipelines prontos — ready=true');
            })
            .catch(err => {
                console.error('[GpuRigidBodyPipeline] pipeline init falhou:', err);
                this.initPromise = null;  // permite retry no próximo frame
            });
    }

    /**
     * Etapa 1 de 2 do readback assíncrono.
     *
     * Apenas encoda `copyBufferToBuffer` (gpu_rb_bodies → staging MAP_READ) no encoder
     * fornecido. Não chama `mapAsync` — isso deve acontecer APÓS `queue.submit()`.
     *
     * @returns `true` se o copy foi encodado e `startReadbackMap()` deve ser chamado
     *          após o submit; `false` se já há um readback pendente (skip).
     */
    private encodePositionReadback(encoder: GPUCommandEncoder, bodyCount: number): boolean {
        if (this.readbackPending) return false;

        const device    = WebGPUContext.getInstance().device;
        const bodiesBuf = this.core.resources.buffers.getBuffer(RB_BODIES_BUFFER_ID)!.native;
        const byteSize  = bodyCount * 128;  // 32 floats × 4 bytes por corpo

        // Recria o staging buffer apenas se o número de corpos cresceu
        if (!this.readbackBuffer || this.readbackBodyCount !== bodyCount) {
            this.readbackBuffer?.destroy();
            this.readbackBuffer = device.createBuffer({
                label: 'rb_readback_staging',
                size:  byteSize,
                usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
            });
            this.readbackBodyCount = bodyCount;
        }

        encoder.copyBufferToBuffer(bodiesBuf, 0, this.readbackBuffer, 0, byteSize);
        this.readbackPending = true;

        return true;
    }

    /**
     * Etapa 2 de 2 do readback assíncrono.
     *
     * Chama `mapAsync` no staging buffer e, quando a Promise resolve, atualiza
     * `body.position` e `body.rotation` para todos os corpos dinâmicos — permitindo
     * que BroadphaseStage sincronize os Transforms e ColliderDescriptorUploader envie
     * posições corretas no próximo frame.
     *
     * DEVE ser chamado APÓS `queue.submit([encoder])` — chamar antes coloca o buffer
     * em estado 'pending map', causando erro de validação WebGPU no submit.
     *
     * Latência: ~1 frame (resolve antes do próximo rAF).
     */
    private startReadbackMap(): void {
        const snapshot = this.gpuBodies.slice();  // snapshot para closure segura

        this.readbackBuffer!.mapAsync(GPUMapMode.READ).then(() => {
            const raw = new Float32Array(this.readbackBuffer!.getMappedRange());
            for (let i = 0; i < snapshot.length; i++) {
                const body = snapshot[i]!;
                if (body.get<boolean>('isKinematic')) continue;  // corpos cinemáticos não são movidos pela GPU
                const off = i * 32;
                // Layout: [0..2]=pos.xyz  [12..15]=rot.xyzw
                body.set('position', [raw[off]!,      raw[off + 1]!,  raw[off + 2]!]);
                body.set('rotation', [raw[off + 12]!, raw[off + 13]!, raw[off + 14]!, raw[off + 15]!]);
            }
            this.readbackBuffer!.unmap();
            this.readbackPending = false;
        }).catch(() => { this.readbackPending = false; });
    }

    /**
     * Atualiza o buffer de mapeamento gpuRbIndex→objectUboSlot e despacha
     * o kernel rb_sync_transform no encoder fornecido pelo renderer.
     *
     * Deve ser chamado APÓS uploadObjectMatrices (que escreve matrizes CPU no UBO)
     * e ANTES do render pass — para sobrescrever apenas os slots dos corpos GPU.
     *
     * @param commandEncoder   Encoder do renderer (sem render pass aberto).
     * @param entityIdToSlot   Mapa entityId → slot no UBO dinâmico (índice em allCommands).
     * @param objectUboNative  GPUBuffer do renderer_object_dyn_ubo (UNIFORM|STORAGE|COPY_DST).
     */
    public syncToRenderer(
        commandEncoder:  GPUCommandEncoder,
        entityIdToSlot:  Map<number, number>,
        objectUboNative: GPUBuffer,
    ): void {
        if (!this.ready || this.gpuBodies.length === 0) return;

        const bodyCount = this.gpuBodies.length;
        const buffers   = this.core.resources.buffers;
        const compute   = this.core.compute;

        // ── Atualiza mapeamento gpuRbIndex → uboSlot ────────────────────────
        let mapData = this.uboMapData;
        if (mapData.length < bodyCount) {
            // Crescimento raro — ocorre só quando bodyCount > 256
            (this as any).uboMapData = new Uint32Array(bodyCount * 2);
            mapData = (this as any).uboMapData;
        }

        let allMapped = true;
        for (let i = 0; i < bodyCount; i++) {
            const slot = entityIdToSlot.get(this.gpuEntityIds[i]!);
            if (slot !== undefined) {
                mapData[i] = slot;
            } else {
                mapData[i] = 0;
                allMapped = false;
            }
        }
        if (!allMapped) return;  // Renderer ainda não extraiu os comandos deste frame

        buffers.writeBuffer(RB_TO_UBO_MAP_BUFFER_ID, mapData.subarray(0, bodyCount));

        // ── Bind group lazy (invalida quando bgCache é invalidado) ──────────
        if (!this.bgCache?.syncTransform) {
            const rbParamsBuf = buffers.getBuffer(RB_SIM_PARAMS_BUFFER_ID)!.native;
            const bodiesBuf   = buffers.getBuffer(RB_BODIES_BUFFER_ID)!.native;
            const mapBuf      = buffers.getBuffer(RB_TO_UBO_MAP_BUFFER_ID)!.native;

            const syncBg = compute.createBindGroupFromPipeline(
                PIPELINE_IDS.RB_SYNC_TRANSFORM, 0,
                [
                    { binding: 0, resource: { buffer: rbParamsBuf } },
                    { binding: 1, resource: { buffer: bodiesBuf   } },
                    { binding: 2, resource: { buffer: mapBuf       } },
                    { binding: 3, resource: { buffer: objectUboNative } },
                ],
                'bg_rb_sync_transform',
            );

            if (this.bgCache) {
                this.bgCache.syncTransform = syncBg;
            }
        }

        const syncBg = this.bgCache?.syncTransform;
        if (!syncBg) return;

        // ── Dispatch ─────────────────────────────────────────────────────────
        const syncPass = compute.beginComputePassExplicit(commandEncoder, 'rb_sync_transform');
        compute.dispatchOnPass(syncPass, PIPELINE_IDS.RB_SYNC_TRANSFORM, [syncBg], Math.ceil(bodyCount / 64));
        syncPass.end();
    }

    private buildBindGroups(): RbBindGroups {
        const compute = this.core.compute;
        const bufs    = this.core.resources.buffers;

        const rbParamsBuf  = bufs.getBuffer(RB_SIM_PARAMS_BUFFER_ID)!.native;
        const bodiesBuf    = bufs.getBuffer(RB_BODIES_BUFFER_ID)!.native;
        const contactsBuf  = bufs.getBuffer(RB_CONTACTS_BUFFER_ID)!.native;
        const collidersBuf = bufs.getBuffer(COLLIDERS_BUFFER_ID)!.native;

        const bg = (id: string, entries: GPUBindGroupEntry[]) =>
            compute.createBindGroupFromPipeline(id, 0, entries, `bg_${id}_rb`);

        const predict = bg(PIPELINE_IDS.RB_PREDICT, [
            { binding: 0, resource: { buffer: rbParamsBuf } },
            { binding: 1, resource: { buffer: bodiesBuf   } },
        ]);

        const narrowphase = bg(PIPELINE_IDS.RB_NARROWPHASE, [
            { binding: 0, resource: { buffer: rbParamsBuf  } },
            { binding: 1, resource: { buffer: bodiesBuf    } },
            { binding: 2, resource: { buffer: collidersBuf } },
            { binding: 3, resource: { buffer: contactsBuf  } },
        ]);

        const solve = bg(PIPELINE_IDS.RB_SOLVE, [
            { binding: 0, resource: { buffer: rbParamsBuf } },
            { binding: 1, resource: { buffer: bodiesBuf   } },
            { binding: 2, resource: { buffer: contactsBuf } },
        ]);

        const velocityRecovery = bg(PIPELINE_IDS.RB_VELOCITY_RECOVERY, [
            { binding: 0, resource: { buffer: rbParamsBuf } },
            { binding: 1, resource: { buffer: bodiesBuf   } },
        ]);

        return { predict, narrowphase, solve, velocityRecovery, syncTransform: null };
    }
}
