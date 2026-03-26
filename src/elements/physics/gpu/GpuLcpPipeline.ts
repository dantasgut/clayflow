/**
 * GpuLcpPipeline — pipeline GPU LCP/PGS para simulação de corpos rígidos.
 *
 * Pipeline separado de GpuRigidBodyPipeline (SI/XPBD) — não modifica esse arquivo.
 * Reutiliza os kernels rb_predict, rb_narrowphase e rb_velocity_recovery já
 * registrados na PhysicsShaderLibrary, adicionando rb_build_lcp e rb_solve_lcp.
 *
 * ## Sequência por frame
 *
 * ```
 * 1. upload colliders (ColliderDescriptorUploader)
 * 2. allocate/realoca buffers se necessário (RigidBodyBufferAllocator)
 * 3. writeSimParams — atualiza RBSimParams uniform (com baumgarte_beta e warm_start_factor)
 * 4. Cria GPUCommandEncoder
 *    4a. rb_predict  (1×, antes do substep loop)
 *    Para cada substep:
 *      4b. rb_narrowphase  (1×)
 *      4c. rb_build_lcp    (1×, computa bias + diagonais em paralelo)
 *      4d. rb_solve_lcp    (1×, PGS-LCP serial, K iters internas)
 *    4e. rb_velocity_recovery (1×, após o substep loop)
 * 5. submit encoder
 * ```
 *
 * ## Buffers exclusivos do pipeline LCP
 *
 *   'gpu_rb_lcp_b' — storage buffer f32[max_contacts] — bias vector
 *
 * ## Relação com GpuRigidBodyPipeline
 *
 * Ambos os pipelines podem coexistir; utilizam buffers distintos (IDs diferentes).
 * O pipeline LCP usa os mesmos IDs de buffer bodies/simparams/contacts/colliders,
 * pois são recursos globais do engine — mas o canal b_vec é exclusivo.
 *
 * Arquitetura: Layer 3 → Facade Layer 1 (WebGPUEngineCore.getInstance()).
 */

import { WebGPUEngineCore }          from '../../../core/WebGPUEngineCore';
import { WebGPUContext }             from '../../../core/context/WebGPUContext';
import type { PhysicsStage }          from '../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext }   from '../../../scene/systems/PhysicsStageContext';
import type { Force }                 from '../../../scene/systems/forces/Force';
import type { RigidBody }             from '../RigidBody';
import type { RigidBodySimConfig }    from '../../../scene/systems/simulation/RigidBodySimConfig';
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

// ── RBSimParams layout — índices f32/u32 no buffer de 80 bytes ────────────────
// Documentado em rb_sim_params.wgsl.ts. Apenas os índices usados aqui:
const SP_GRAVITY_X             = 0;
const SP_GRAVITY_Y             = 1;
const SP_GRAVITY_Z             = 2;
const SP_DT                    = 3;
const SP_BODY_COUNT            = 4;   // u32
const SP_COLLIDER_COUNT        = 5;   // u32
const SP_MAX_CONTACTS          = 6;   // u32
const SP_SOLVE_ITERS           = 7;   // u32
const SP_DT_FRAME              = 8;
const SP_RESTITUTION           = 9;
const SP_PENETRATION_SLOP      = 10;
const SP_LINEAR_DAMPING        = 11;
const SP_ANGULAR_DAMPING       = 12;
// índice 13: _pad1d — não escrever
const SP_PREDICTIVE_THRESHOLD  = 14;
const SP_RESTITUTION_THRESHOLD = 15;
const SP_SLEEP_LIN_THRESHOLD   = 16;
// índice 17: _pad2a — não escrever
const SP_BAUMGARTE_BETA        = 18;  // f32: offset 72 → índice 18 no array f32
const SP_WARM_START_FACTOR     = 19;  // f32: offset 76 → índice 19 no array f32

/** ID do buffer de bias LCP exclusivo deste pipeline. */
export const RB_LCP_BIAS_BUFFER_ID = 'gpu_rb_lcp_b';

type LcpBindGroups = {
    predict:          GPUBindGroup;
    narrowphase:      GPUBindGroup;
    buildLcp:         GPUBindGroup;
    solveLcp:         GPUBindGroup;
    velocityRecovery: GPUBindGroup;
    syncTransform:    GPUBindGroup | null;
};

export class GpuLcpPipeline implements PhysicsStage {

    private readonly core      = WebGPUEngineCore.getInstance();
    private readonly allocator = new RigidBodyBufferAllocator();
    private readonly uploader  = new ColliderDescriptorUploader();
    private readonly phyProfiler: GpuPhysicsProfiler;

    private ready        = false;
    private initPromise: Promise<void> | null = null;

    private readbackBuffer: GPUBuffer | null = null;
    private readbackBodyCount = 0;
    private readbackPending   = false;

    private bgCache: LcpBindGroups | null = null;

    private gpuBodies: RigidBody[] = [];
    private gpuEntityIds: number[] = [];

    private lastColliderCount = -1;
    private lastBodyCount     = -1;
    private lastMaxContacts   = -1;

    private readonly rbSimParamsBuf = new ArrayBuffer(80);
    private readonly rbSimParamsF32 = new Float32Array(this.rbSimParamsBuf);
    private readonly rbSimParamsU32 = new Uint32Array(this.rbSimParamsBuf);

    private readonly prevSimParamsF32 = new Float32Array(20);

    private readonly uboMapData = new Uint32Array(256);

    constructor(
        private readonly globalForces:    Map<string, Force>,
        private readonly getSubsteps:     () => number,
        private readonly solveIterations: number = 15,
        logInterval:                      number = 60,
        private readonly config?:         RigidBodySimConfig,
    ) {
        this.phyProfiler = new GpuPhysicsProfiler(logInterval);
    }

    // ── PhysicsStage ──────────────────────────────────────────────────────────

    public execute(context: PhysicsStageContext, dtFrame: number): void {
        if (!this.ready) {
            this.kickInit();
            return;
        }
        if (dtFrame <= 0) return;

        const newBodies:    RigidBody[] = [];
        const newEntityIds: number[]    = [];
        for (const { body, entity } of context.bodies.values()) {
            if (body.physicType !== 'RigidBody') continue;
            if (!body.get<boolean>('gpuSimulated')) continue;
            newBodies.push(body as unknown as RigidBody);
            newEntityIds.push(entity.id);
        }

        if (newBodies.length === 0) return;

        const substeps = 1;
        const dtSub    = dtFrame;

        const core    = this.core;
        const buffers = core.resources.buffers;
        const compute = core.compute;

        for (let i = 0; i < newBodies.length; i++) {
            newBodies[i]!.set('gpuRbIndex', i);
        }

        const colliderCount = this.uploader.upload(context);

        const bodyCountChanged     = newBodies.length !== this.lastBodyCount;
        const colliderCountChanged = colliderCount !== this.lastColliderCount;
        const maxContacts          = newBodies.length * Math.max(colliderCount, 1);
        const maxContactsChanged   = maxContacts !== this.lastMaxContacts;

        if (bodyCountChanged || colliderCountChanged) {
            this.gpuBodies    = newBodies;
            this.gpuEntityIds = newEntityIds;
            this.allocator.allocate(this.gpuBodies, colliderCount);
            this.lastBodyCount     = newBodies.length;
            this.lastColliderCount = colliderCount;
            this.bgCache = null;
        }

        if (maxContactsChanged) {
            this.lastMaxContacts = maxContacts;
            // Recria buffer de bias
            if (buffers.getBuffer(RB_LCP_BIAS_BUFFER_ID)) {
                buffers.destroyBuffer(RB_LCP_BIAS_BUFFER_ID);
            }
            buffers.createStorageBuffer(RB_LCP_BIAS_BUFFER_ID, Math.max(maxContacts, 1) * 4);
            this.bgCache = null;
        }

        if (this.uploader.bufferRecreated) {
            this.bgCache = null;
        }

        const bodyCount = this.gpuBodies.length;

        // ── RBSimParams ────────────────────────────────────────────────────────
        let gx = 0, gy = 0, gz = 0;
        for (const force of this.globalForces.values()) {
            const f = force.compute(this.gpuBodies[0]!, dtSub);
            gx += f[0] ?? 0;
            gy += f[1] ?? 0;
            gz += f[2] ?? 0;
        }

        const K = this.solveIterations * this.getSubsteps();

        this.rbSimParamsF32[SP_GRAVITY_X]      = gx;
        this.rbSimParamsF32[SP_GRAVITY_Y]      = gy;
        this.rbSimParamsF32[SP_GRAVITY_Z]      = gz;
        this.rbSimParamsF32[SP_DT]             = dtSub;
        this.rbSimParamsU32[SP_BODY_COUNT]     = bodyCount;
        this.rbSimParamsU32[SP_COLLIDER_COUNT] = colliderCount;
        this.rbSimParamsU32[SP_MAX_CONTACTS]   = maxContacts;
        this.rbSimParamsU32[SP_SOLVE_ITERS]    = K;
        this.rbSimParamsF32[SP_DT_FRAME]              = dtFrame;
        this.rbSimParamsF32[SP_RESTITUTION]           = this.config?.baumgarteBeta !== undefined ? 0.1 : 0.1;
        this.rbSimParamsF32[SP_PENETRATION_SLOP]      = 0.005;
        this.rbSimParamsF32[SP_LINEAR_DAMPING]        = 4.0;
        this.rbSimParamsF32[SP_ANGULAR_DAMPING]       = 4.0;
        this.rbSimParamsF32[SP_PREDICTIVE_THRESHOLD]  = this.config?.predictiveThreshold  ?? 0.0;
        this.rbSimParamsF32[SP_RESTITUTION_THRESHOLD] = this.config?.restitutionThreshold ?? 2.0;
        this.rbSimParamsF32[SP_SLEEP_LIN_THRESHOLD]   = this.config?.sleepLinThreshold    ?? 0.01;
        this.rbSimParamsF32[SP_BAUMGARTE_BETA]        = this.config?.baumgarteBeta        ?? 0.2;
        this.rbSimParamsF32[SP_WARM_START_FACTOR]     = this.config?.warmStartFactor      ?? 0.85;

        let simParamsDirty = false;
        for (let i = 0; i < 20; i++) {
            if (this.rbSimParamsF32[i] !== this.prevSimParamsF32[i]) {
                simParamsDirty = true;
                break;
            }
        }
        if (simParamsDirty) {
            buffers.writeBuffer(RB_SIM_PARAMS_BUFFER_ID, this.rbSimParamsF32);
            this.prevSimParamsF32.set(this.rbSimParamsF32);
        }

        if (!this.bgCache) {
            this.bgCache = this.buildBindGroups();
        }

        const bg = this.bgCache;

        const wgBodies   = Math.ceil(bodyCount / 64);
        const wgContacts = Math.ceil(maxContacts / 64);

        try {
            const encoder  = core.renderPasses.createCommandEncoder('phys_lcp_gpu');
            const profiler = this.phyProfiler;

            // rb_predict — 1× por frame
            const predictPass = compute.beginComputePassExplicit(
                encoder, 'lcp_rb_predict', profiler.timestampWritesFor(PHYS_SLOTS.predict));
            compute.dispatchOnPass(predictPass, PIPELINE_IDS.RB_PREDICT, [bg.predict], wgBodies);
            predictPass.end();

            for (let s = 0; s < substeps; s++) {
                const isFirstSub = s === 0;

                // rb_narrowphase
                const npPass = compute.beginComputePassExplicit(
                    encoder, `lcp_rb_narrowphase_${s}`,
                    isFirstSub ? profiler.timestampWritesFor(PHYS_SLOTS.narrowphase) : undefined);
                compute.dispatchOnPass(npPass, PIPELINE_IDS.RB_NARROWPHASE, [bg.narrowphase], wgContacts);
                npPass.end();

                // rb_build_lcp — pré-computa bias + diagonais
                const buildPass = compute.beginComputePassExplicit(
                    encoder, `lcp_rb_build_lcp_${s}`);
                compute.dispatchOnPass(buildPass, PIPELINE_IDS.RB_BUILD_LCP, [bg.buildLcp], wgContacts);
                buildPass.end();

                // rb_solve_lcp — PGS-LCP serial com K iters internas
                const solvePass = compute.beginComputePassExplicit(
                    encoder, `lcp_rb_solve_lcp_${s}`,
                    isFirstSub ? profiler.timestampWritesFor(PHYS_SLOTS.solve) : undefined);
                compute.dispatchOnPass(solvePass, PIPELINE_IDS.RB_SOLVE_LCP, [bg.solveLcp], 1);
                solvePass.end();
            }

            // rb_velocity_recovery — 1× por frame
            const vrPass = compute.beginComputePassExplicit(
                encoder, 'lcp_rb_velocity_recovery', profiler.timestampWritesFor(PHYS_SLOTS.velocityRecovery));
            compute.dispatchOnPass(vrPass, PIPELINE_IDS.RB_VELOCITY_RECOVERY, [bg.velocityRecovery], wgBodies);
            vrPass.end();

            const doReadback    = this.encodePositionReadback(encoder, bodyCount);
            const doProfileRead = profiler.encodeResolve(encoder);

            core.renderPasses.submit([encoder]);

            if (doReadback)    this.startReadbackMap();
            if (doProfileRead) profiler.startRead();
        } catch (err) {
            console.error('[GpuLcpPipeline] encode falhou:', err);
            this.bgCache = null;
        }
    }

    // ── Privado ───────────────────────────────────────────────────────────────

    private kickInit(): void {
        if (this.initPromise) return;
        this.initPromise = ensurePhysicsPipelinesInitialized(this.core)
            .then(() => {
                this.ready = true;
                console.info('[GpuLcpPipeline] pipelines prontos — ready=true');
            })
            .catch(err => {
                console.error('[GpuLcpPipeline] pipeline init falhou:', err);
                this.initPromise = null;
            });
    }

    private encodePositionReadback(encoder: GPUCommandEncoder, bodyCount: number): boolean {
        if (this.readbackPending) return false;

        const device    = WebGPUContext.getInstance().device;
        const bodiesBuf = this.core.resources.buffers.getBuffer(RB_BODIES_BUFFER_ID)!.native;
        const byteSize  = bodyCount * 128;

        if (!this.readbackBuffer || this.readbackBodyCount !== bodyCount) {
            this.readbackBuffer?.destroy();
            this.readbackBuffer = device.createBuffer({
                label: 'lcp_rb_readback_staging',
                size:  byteSize,
                usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
            });
            this.readbackBodyCount = bodyCount;
        }

        encoder.copyBufferToBuffer(bodiesBuf, 0, this.readbackBuffer, 0, byteSize);
        this.readbackPending = true;

        return true;
    }

    private startReadbackMap(): void {
        const snapshot = this.gpuBodies.slice();

        this.readbackBuffer!.mapAsync(GPUMapMode.READ).then(() => {
            const raw = new Float32Array(this.readbackBuffer!.getMappedRange());
            for (let i = 0; i < snapshot.length; i++) {
                const body = snapshot[i]!;
                if (body.get<boolean>('isKinematic')) continue;
                const off = i * 32;
                body.set('position', [raw[off]!,      raw[off + 1]!,  raw[off + 2]!]);
                body.set('rotation', [raw[off + 12]!, raw[off + 13]!, raw[off + 14]!, raw[off + 15]!]);
            }
            this.readbackBuffer!.unmap();
            this.readbackPending = false;
        }).catch(() => { this.readbackPending = false; });
    }

    /**
     * Despacha rb_sync_transform no encoder do renderer.
     * Interface compatível com GpuRigidBodyPipeline.syncToRenderer().
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
        if (!allMapped) return;

        buffers.writeBuffer(RB_TO_UBO_MAP_BUFFER_ID, mapData.subarray(0, bodyCount));

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
                'bg_lcp_rb_sync_transform',
            );

            if (this.bgCache) {
                this.bgCache.syncTransform = syncBg;
            }
        }

        const syncBg = this.bgCache?.syncTransform;
        if (!syncBg) return;

        const syncPass = compute.beginComputePassExplicit(commandEncoder, 'lcp_rb_sync_transform');
        compute.dispatchOnPass(syncPass, PIPELINE_IDS.RB_SYNC_TRANSFORM, [syncBg], Math.ceil(bodyCount / 64));
        syncPass.end();
    }

    private buildBindGroups(): LcpBindGroups {
        const compute = this.core.compute;
        const bufs    = this.core.resources.buffers;

        const rbParamsBuf  = bufs.getBuffer(RB_SIM_PARAMS_BUFFER_ID)!.native;
        const bodiesBuf    = bufs.getBuffer(RB_BODIES_BUFFER_ID)!.native;
        const contactsBuf  = bufs.getBuffer(RB_CONTACTS_BUFFER_ID)!.native;
        const collidersBuf = bufs.getBuffer(COLLIDERS_BUFFER_ID)!.native;
        const bVecBuf      = bufs.getBuffer(RB_LCP_BIAS_BUFFER_ID)!.native;

        const bg = (id: string, entries: GPUBindGroupEntry[]) =>
            compute.createBindGroupFromPipeline(id, 0, entries, `bg_${id}_lcp`);

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

        const buildLcp = bg(PIPELINE_IDS.RB_BUILD_LCP, [
            { binding: 0, resource: { buffer: rbParamsBuf } },
            { binding: 1, resource: { buffer: bodiesBuf   } },
            { binding: 2, resource: { buffer: contactsBuf } },
            { binding: 3, resource: { buffer: bVecBuf     } },
        ]);

        const solveLcp = bg(PIPELINE_IDS.RB_SOLVE_LCP, [
            { binding: 0, resource: { buffer: rbParamsBuf } },
            { binding: 1, resource: { buffer: bodiesBuf   } },
            { binding: 2, resource: { buffer: contactsBuf } },
            { binding: 3, resource: { buffer: bVecBuf     } },
        ]);

        const velocityRecovery = bg(PIPELINE_IDS.RB_VELOCITY_RECOVERY, [
            { binding: 0, resource: { buffer: rbParamsBuf } },
            { binding: 1, resource: { buffer: bodiesBuf   } },
        ]);

        return { predict, narrowphase, buildLcp, solveLcp, velocityRecovery, syncTransform: null };
    }
}
