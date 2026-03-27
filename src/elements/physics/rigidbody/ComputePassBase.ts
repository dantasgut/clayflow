/**
 * ComputePassBase<TBG> — base abstrata para passes de compute de corpos rígidos.
 *
 * Extrai o código compartilhado entre XPBDComputePass (antigo GpuRigidBodyPipeline) e
 * LCPComputePass (antigo GpuLcpPipeline), evitando duplicação de:
 *   - campos de estado (core, uploader, profiler, readback, bgCache, gpuBodies...)
 *   - ensureReady / dispose / kickInit
 *   - syncToRenderer
 *   - maquinaria de readback assíncrono
 *   - início do execute(): coleta de corpos, atribuição de gpuRbIndex, upload de colliders
 *
 * Subclasses implementam os métodos abstratos para definir:
 *   - passId / acceptedPhysicTypes
 *   - buildBindGroups()
 *   - encodeSimParams()
 *   - encodeAlgorithmPasses()
 *
 * Arquitetura: Layer 3 → Facade Layer 1 (WebGPUEngineCore.getInstance()).
 */

import { WebGPUEngineCore }          from '../../../core/WebGPUEngineCore';
import { WebGPUContext }             from '../../../core/context/WebGPUContext';
import type { Force }                 from '../../../scene/systems/forces/Force';
import type { RigidBody }             from '../RigidBody';
import type { RigidBodySimConfig }    from '../../../scene/systems/simulation/RigidBodySimConfig';
import { ColliderDescriptorUploader, COLLIDERS_BUFFER_ID } from '../shared/ColliderDescriptorUploader';
import { RIGID_BODY_GLOBAL_BUFFER_SET } from './RigidBodyGlobalBufferSet';
import {
    PIPELINE_IDS,
    ensurePhysicsPipelinesInitialized,
} from '../shared/ShaderLibrary';
import { GpuPhysicsProfiler, PHYS_SLOTS } from './Profiler';
import type { GpuPipelineEventBus }       from '../../../scene/systems/gpu/GpuPipelineEventBus';
import type { PhysicsComputePass }        from '../../../scene/systems/PhysicsComputePass';
import type { GpuSimContext }             from '../../../scene/systems/GpuSimContext';
import type { EngineCore }               from '../../../core/interfaces/EngineCore';

export abstract class ComputePassBase<TBG> implements PhysicsComputePass {

    // ── Identidade do pass (implementados pela subclasse) ─────────────────
    public abstract readonly passId: string;
    public abstract readonly acceptedPhysicTypes: readonly string[];

    // ── Estado interno ────────────────────────────────────────────────────
    protected core: EngineCore = WebGPUEngineCore.getInstance();
    protected readonly uploader  = new ColliderDescriptorUploader();
    protected readonly phyProfiler: GpuPhysicsProfiler;

    protected ready        = false;
    protected initPromise: Promise<void> | null = null;

    // Double-buffer readback: alterna entre dois staging buffers para eliminar gap de 2–4 frames
    private readbackBuffers: [GPUBuffer | null, GPUBuffer | null] = [null, null];
    private readbackActiveIndex = 0;
    private readbackBodyCounts: [number, number] = [0, 0];
    private readbackPendingFlags: [boolean, boolean] = [false, false];

    /** @deprecated Use readbackBuffers[readbackActiveIndex] internamente. */
    protected get readbackBuffer(): GPUBuffer | null { return this.readbackBuffers[this.readbackActiveIndex] ?? null; }
    protected get readbackBodyCount(): number { return this.readbackBodyCounts[this.readbackActiveIndex] ?? 0; }
    protected set readbackBodyCount(v: number) { this.readbackBodyCounts[this.readbackActiveIndex] = v; }
    protected get readbackPending(): boolean { return this.readbackPendingFlags[this.readbackActiveIndex] ?? false; }
    protected set readbackPending(v: boolean) { this.readbackPendingFlags[this.readbackActiveIndex] = v; }

    /** Bind groups cacheados — invalidados quando o buffer de colliders é recriado. */
    protected bgCache: TBG | null = null;

    /** Lista ordenada de corpos GPU-simulados — determina o índice gpuRbIndex. */
    protected gpuBodies: RigidBody[] = [];

    /** entity.id de cada corpo na posição gpuRbIndex — para montar o mapeamento UBO. */
    protected gpuEntityIds: number[] = [];

    protected readonly rbSimParamsBuf = new ArrayBuffer(80);
    protected readonly rbSimParamsF32 = new Float32Array(this.rbSimParamsBuf);
    protected readonly rbSimParamsU32 = new Uint32Array(this.rbSimParamsBuf);

    /** Cache do frame anterior para detecção de mudanças nos SimParams. */
    protected readonly prevSimParamsF32 = new Float32Array(20);

    /** Buffer temporário para upload do mapeamento gpuRbIndex→uboSlot. */
    protected uboMapData = new Uint32Array(256);

    constructor(
        protected readonly globalForces:    Map<string, Force>,
        protected readonly getSubsteps:     () => number,
        protected readonly solveIterations: number,
        logInterval:                        number,
        protected readonly config?:         RigidBodySimConfig,
        protected readonly eventBus?:       GpuPipelineEventBus,
    ) {
        this.phyProfiler = new GpuPhysicsProfiler(logInterval);

        // Qualquer realocação do buffer global invalida os bind groups
        eventBus?.on('physics:rb:reallocated', () => { this.bgCache = null; });
    }

    // ── PhysicsComputePass ────────────────────────────────────────────────

    public ensureReady(core: EngineCore): Promise<void> {
        this.core = core;
        if (!this.initPromise) this.kickInit();
        return this.initPromise ?? Promise.resolve();
    }

    public dispose(): void {
        this.bgCache = null;
        this.readbackBuffers[0]?.destroy();
        this.readbackBuffers[1]?.destroy();
        this.readbackBuffers = [null, null];
        this.readbackPendingFlags = [false, false];
    }

    public execute(context: GpuSimContext, dtFrame: number): void {
        if (!this.ready) {
            this.kickInit();
            return;
        }
        if (dtFrame <= 0) return;

        // Coleta todos os corpos GPU-simulados aceitos por este pass
        const newBodies:    RigidBody[] = [];
        const newEntityIds: number[]    = [];
        for (const { body, entity } of context.bodies.values()) {
            if (!this.acceptedPhysicTypes.includes(body.physicType)) continue;
            if (!body.currentState.canParticipateInGpuBatch()) continue;
            newBodies.push(body as unknown as RigidBody);
            newEntityIds.push(entity.id);
        }

        if (newBodies.length === 0) return;

        const substeps = Math.max(this.getSubsteps(), 1);
        const dtSub    = dtFrame; // rb_velocity_recovery usa dt_frame; rb_predict usa dtSub (gravity.w)

        const core    = this.core;
        const buffers = core.resources.buffers;
        const compute = core.compute;

        // Pré-atribui gpuRbIndex para que ColliderDescriptorUploader preencha
        // body_owner_idx corretamente (evita auto-colisão no narrowphase).
        for (let i = 0; i < newBodies.length; i++) {
            newBodies[i]!.gpuRbIndex = i;
        }

        const colliderCount = this.uploader.upload(context);

        this.gpuBodies    = newBodies;
        this.gpuEntityIds = newEntityIds;

        if (this.uploader.bufferRecreated) {
            this.bgCache = null;
        }

        const bodyCount   = this.gpuBodies.length;
        const maxContacts = bodyCount * Math.max(colliderCount, 1);

        // ── SimParams (delegado à subclasse) ──────────────────────────────
        this.encodeSimParams(colliderCount, bodyCount, maxContacts, dtFrame, dtSub);

        // ── Bind groups (lazy, cacheados) ─────────────────────────────────
        if (!this.bgCache) {
            this.bgCache = this.buildBindGroups(colliderCount, bodyCount, maxContacts);
        }

        const bg = this.bgCache;

        // ── Encode ────────────────────────────────────────────────────────
        try {
            const encoder  = core.renderPasses.createCommandEncoder(`phys_${this.passId}_gpu`);
            const profiler = this.phyProfiler;

            this.encodeAlgorithmPasses(encoder, bg, colliderCount, bodyCount, maxContacts, dtFrame, substeps, profiler.isActive);

            const doReadback    = this.encodePositionReadback(encoder, bodyCount);
            const doProfileRead = profiler.encodeResolve(encoder);

            core.renderPasses.submit([encoder]);
            this.eventBus?.emit('physics:frame:submitted', { bodyCount, submitTime: performance.now() });

            if (doReadback)    this.startReadbackMap();
            if (doProfileRead) profiler.startRead();
        } catch (err) {
            console.error(`[${this.passId}] encode falhou:`, err);
            this.bgCache = null;
        }
    }

    // ── Métodos abstratos (implementados pela subclasse) ─────────────────

    /**
     * Constrói e retorna o conjunto de bind groups para este pass.
     * Chamado quando bgCache é null (primeira execução ou após invalidação).
     */
    protected abstract buildBindGroups(
        colliderCount: number,
        bodyCount: number,
        maxContacts: number,
    ): TBG;

    /**
     * Escreve os parâmetros de simulação no uniform buffer.
     * A subclasse tem acesso a rbSimParamsF32/U32 e pode escrever diretamente.
     */
    protected abstract encodeSimParams(
        colliderCount: number,
        bodyCount: number,
        maxContacts: number,
        dtFrame: number,
        dtSub: number,
    ): void;

    /**
     * Encoda todos os compute passes específicos do algoritmo (predict, solve, etc.)
     * no encoder fornecido. Chamado após a criação do encoder e dos bind groups.
     */
    protected abstract encodeAlgorithmPasses(
        encoder:        GPUCommandEncoder,
        bg:             TBG,
        colliderCount:  number,
        bodyCount:      number,
        maxContacts:    number,
        dtFrame:        number,
        substeps:       number,
        shouldProfile:  boolean,
    ): void;

    // ── Métodos compartilhados (syncToRenderer, readback) ────────────────

    /**
     * Atualiza o buffer de mapeamento gpuRbIndex→objectUboSlot e despacha
     * o kernel rb_sync_transform no encoder fornecido pelo renderer.
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

        let mapData = this.uboMapData;
        if (mapData.length < bodyCount) {
            this.uboMapData = new Uint32Array(bodyCount * 2);
            mapData = this.uboMapData;
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
        if (!allMapped) return;

        buffers.writeBuffer(RIGID_BODY_GLOBAL_BUFFER_SET.toUboMapId, mapData.subarray(0, bodyCount));

        if (!this.hasSyncTransform()) {
            const rbParamsBuf = buffers.getBuffer(RIGID_BODY_GLOBAL_BUFFER_SET.simParamsId)!.native;
            const bodiesBuf   = buffers.getBuffer(RIGID_BODY_GLOBAL_BUFFER_SET.bodiesId)!.native;
            const mapBuf      = buffers.getBuffer(RIGID_BODY_GLOBAL_BUFFER_SET.toUboMapId)!.native;

            const syncBg = compute.createBindGroupFromPipeline(
                PIPELINE_IDS.RB_SYNC_TRANSFORM, 0,
                [
                    { binding: 0, resource: { buffer: rbParamsBuf } },
                    { binding: 1, resource: { buffer: bodiesBuf   } },
                    { binding: 2, resource: { buffer: mapBuf       } },
                    { binding: 3, resource: { buffer: objectUboNative } },
                ],
                `bg_${this.passId}_rb_sync_transform`,
            );

            this.setSyncTransform(syncBg);
        }

        const syncBg = this.getSyncTransform();
        if (!syncBg) return;

        const syncPass = compute.beginComputePassExplicit(commandEncoder, `${this.passId}_rb_sync_transform`);
        compute.dispatchOnPass(syncPass, PIPELINE_IDS.RB_SYNC_TRANSFORM, [syncBg], Math.ceil(bodyCount / 64));
        syncPass.end();
    }

    /**
     * Retorna true se o bind group de sync já foi criado.
     * Subclasses sobrescrevem se armazenam syncTransform dentro do TBG.
     */
    protected hasSyncTransform(): boolean {
        return false;
    }

    /**
     * Define o bind group de sync no bgCache (se suportado pela subclasse).
     * Subclasses sobrescrevem se armazenam syncTransform dentro do TBG.
     */
    protected setSyncTransform(_bg: GPUBindGroup): void {
        // Subclasses com syncTransform no TBG sobrescrevem este método
    }

    /**
     * Retorna o bind group de sync (se disponível).
     * Subclasses sobrescrevem para retornar o valor armazenado no TBG.
     */
    protected getSyncTransform(): GPUBindGroup | null {
        return null;
    }

    // ── Privado ───────────────────────────────────────────────────────────

    protected kickInit(): void {
        if (this.initPromise) return;
        this.initPromise = ensurePhysicsPipelinesInitialized(this.core)
            .then(() => {
                this.ready = true;
                console.info(`[${this.passId}] pipelines prontos — ready=true`);
            })
            .catch(err => {
                console.error(`[${this.passId}] pipeline init falhou:`, err);
                this.initPromise = null;
            });
    }

    /**
     * Etapa 1 de 2 do readback assíncrono.
     * Encoda copyBufferToBuffer (gpu_rb_bodies → staging MAP_READ).
     * Retorna true se o copy foi encodado e startReadbackMap() deve ser chamado após submit.
     */
    protected encodePositionReadback(encoder: GPUCommandEncoder, bodyCount: number): boolean {
        // Avança para o próximo slot do double-buffer
        const nextIndex = (this.readbackActiveIndex + 1) % 2 as 0 | 1;

        // Se o próximo slot ainda está mapeando, aguarda — não há slot livre
        if (this.readbackPendingFlags[nextIndex]) return false;

        this.readbackActiveIndex = nextIndex;

        const device    = WebGPUContext.getInstance().device;
        const bodiesBuf = this.core.resources.buffers.getBuffer(RIGID_BODY_GLOBAL_BUFFER_SET.bodiesId)!.native;
        const byteSize  = bodyCount * 160;  // 40 floats × 4 bytes (RIGID_BODY_STRIDE=160)

        if (!this.readbackBuffers[nextIndex] || this.readbackBodyCounts[nextIndex] !== bodyCount) {
            this.readbackBuffers[nextIndex]?.destroy();
            this.readbackBuffers[nextIndex] = device.createBuffer({
                label: `${this.passId}_rb_readback_staging_${nextIndex}`,
                size:  byteSize,
                usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
            });
            this.readbackBodyCounts[nextIndex] = bodyCount;
        }

        encoder.copyBufferToBuffer(bodiesBuf, 0, this.readbackBuffers[nextIndex]!, 0, byteSize);
        this.readbackPendingFlags[nextIndex] = true;

        return true;
    }

    /**
     * Etapa 2 de 2 do readback assíncrono.
     * Chama mapAsync e, quando resolve, atualiza body.simState com posição/rotação da GPU.
     * DEVE ser chamado APÓS queue.submit([encoder]).
     */
    protected startReadbackMap(): void {
        const snapshot    = this.gpuBodies.slice();
        const pipelineId  = this.passId;
        const slotIndex   = this.readbackActiveIndex;
        const stagingBuf  = this.readbackBuffers[slotIndex]!;

        stagingBuf.mapAsync(GPUMapMode.READ).then(() => {
            const raw = new Float32Array(stagingBuf.getMappedRange());

            const transformsSnapshot: Array<{
                gpuRbIndex: number;
                position:   readonly [number, number, number];
                rotation:   readonly [number, number, number, number];
            }> = [];

            for (let i = 0; i < snapshot.length; i++) {
                const body = snapshot[i]!;
                if (!body.currentState.canIntegrate()) continue;
                const off = i * 40;  // RIGID_BODY_STRIDE=160 bytes = 40 floats
                if (body.simState) {
                    body.simState.position[0]        = raw[off]!;
                    body.simState.position[1]        = raw[off + 1]!;
                    body.simState.position[2]        = raw[off + 2]!;
                    body.simState.velocity[0]        = raw[off + 4]!;
                    body.simState.velocity[1]        = raw[off + 5]!;
                    body.simState.velocity[2]        = raw[off + 6]!;
                    body.simState.angularVelocity[0] = raw[off + 8]!;
                    body.simState.angularVelocity[1] = raw[off + 9]!;
                    body.simState.angularVelocity[2] = raw[off + 10]!;
                    body.simState.rotation[0]        = raw[off + 12]!;
                    body.simState.rotation[1]        = raw[off + 13]!;
                    body.simState.rotation[2]        = raw[off + 14]!;
                    body.simState.rotation[3]        = raw[off + 15]!;
                }
                transformsSnapshot.push({
                    gpuRbIndex: i,
                    position:   [raw[off]!, raw[off + 1]!, raw[off + 2]!] as const,
                    rotation:   [raw[off + 12]!, raw[off + 13]!, raw[off + 14]!, raw[off + 15]!] as const,
                });
            }

            this.eventBus?.emit('physics:transforms:ready', {
                pipelineId,
                transforms: transformsSnapshot,
            });

            stagingBuf.unmap();
            this.readbackPendingFlags[slotIndex] = false;
        }).catch(() => { this.readbackPendingFlags[slotIndex] = false; });
    }
}
