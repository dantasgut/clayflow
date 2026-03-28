/**
 * LCPComputePass — pipeline GPU LCP/PGS para simulação de corpos rígidos.
 *
 * Pipeline separado de XPBDComputePass (SI/XPBD). Reutiliza os kernels rb_predict,
 * rb_narrowphase e rb_velocity_recovery já registrados na ShaderLibrary,
 * adicionando rb_build_lcp e rb_solve_lcp.
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
 *    4e. rb_lcp_commit (1×, após o substep loop)
 * 5. submit encoder
 * ```
 *
 * ## Buffers exclusivos do pipeline LCP
 *
 *   'gpu_rb_lcp_b' — storage buffer f32[max_contacts] — bias vector
 *
 * Arquitetura: Layer 3 → Facade Layer 1 (WebGPUEngineCore.getInstance()).
 */

import { WebGPUEngineCore }           from '../../../core/WebGPUEngineCore';
import type { Force }                  from '../../../scene/systems/forces/Force';
import type { RigidBodySimConfig }     from '../../../scene/systems/simulation/RigidBodySimConfig';
import { COLLIDERS_BUFFER_ID }         from '../shared/ColliderDescriptorUploader';
import { RIGID_BODY_GLOBAL_BUFFER_SET } from './RigidBodyGlobalBufferSet';
import { PIPELINE_IDS }                from '../shared/ShaderLibrary';
import { PHYS_SLOTS }                  from './Profiler';
import type { GpuPipelineEventBus }    from '../../../scene/systems/gpu/GpuPipelineEventBus';
import {
    SP_GRAVITY_X, SP_GRAVITY_Y, SP_GRAVITY_Z,
    SP_DT, SP_BODY_COUNT, SP_COLLIDER_COUNT, SP_MAX_CONTACTS, SP_SOLVE_ITERS,
    SP_DT_FRAME, SP_RESTITUTION, SP_PENETRATION_SLOP,
    SP_LINEAR_DAMPING, SP_ANGULAR_DAMPING,
    SP_PREDICTIVE_THRESHOLD, SP_RESTITUTION_THRESHOLD, SP_SLEEP_LIN_THRESHOLD,
    SP_BAUMGARTE_BETA, SP_WARM_START_FACTOR,
} from './SimParamsLayout';
import { ComputePassBase } from './ComputePassBase';

/** ID do buffer de bias LCP exclusivo deste pipeline. */
export const RB_LCP_BIAS_BUFFER_ID = 'gpu_rb_lcp_b';

type LcpBindGroups = {
    predict:          GPUBindGroup;
    updateColliders:  GPUBindGroup;
    narrowphase:      GPUBindGroup;
    buildLcp:         GPUBindGroup;
    solveLcp:         GPUBindGroup;
    velocityRecovery: GPUBindGroup;
    lcpCommit:        GPUBindGroup;
    syncTransform:    GPUBindGroup | null;
};

export class LCPComputePass extends ComputePassBase<LcpBindGroups> {

    public readonly passId = 'LCPRigidBody';
    public readonly acceptedPhysicTypes: readonly string[] = ['RigidBody'];

    /** Último maxContacts conhecido — detecta quando o bias buffer LCP precisa ser recriado. */
    private lastMaxContacts = -1;

    constructor(
        globalForces:    Map<string, Force>,
        getSubsteps:     () => number,
        solveIterations: number = 25,
        logInterval:     number = 60,
        config?:         RigidBodySimConfig,
        eventBus?:       GpuPipelineEventBus,
    ) {
        super(globalForces, getSubsteps, solveIterations, logInterval, config, eventBus);

        // Sobrescreve o handler de physics:rb:reallocated para também recriar o bias buffer LCP
        eventBus?.on('physics:rb:reallocated', ({ bodyCount, colliderCount }) => {
            this.bgCache = null;
            const maxContacts = bodyCount * Math.max(colliderCount, 1);
            this.lastMaxContacts = maxContacts;
            const bufs = WebGPUEngineCore.getInstance().resources.buffers;
            if (bufs.getBuffer(RB_LCP_BIAS_BUFFER_ID)) bufs.destroyBuffer(RB_LCP_BIAS_BUFFER_ID);
            bufs.createStorageBuffer(RB_LCP_BIAS_BUFFER_ID, Math.max(maxContacts, 1) * 4);
        });
    }

    // ── Métodos abstratos ─────────────────────────────────────────────────

    protected encodeSimParams(
        colliderCount: number,
        bodyCount:     number,
        maxContacts:   number,
        dtFrame:       number,
        dtSub:         number,
    ): void {
        const buffers = this.core.resources.buffers;

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
        // LCP: rb_predict e rb_lcp_commit rodam 1× por frame — gravity.w deve ser dtFrame.
        // (XPBD usa dtSub aqui porque rb_predict roda N× por substep.)
        this.rbSimParamsF32[SP_DT]             = dtFrame;
        this.rbSimParamsU32[SP_BODY_COUNT]     = bodyCount;
        this.rbSimParamsU32[SP_COLLIDER_COUNT] = colliderCount;
        this.rbSimParamsU32[SP_MAX_CONTACTS]   = maxContacts;
        this.rbSimParamsU32[SP_SOLVE_ITERS]    = K;
        this.rbSimParamsF32[SP_DT_FRAME]              = dtFrame;
        this.rbSimParamsF32[SP_RESTITUTION]           = 0.1;
        this.rbSimParamsF32[SP_PENETRATION_SLOP]      = 0.001;
        this.rbSimParamsF32[SP_LINEAR_DAMPING]        = 0.0;    // sem damping global — per-body em mat_props.z
        this.rbSimParamsF32[SP_ANGULAR_DAMPING]       = 3.0;   // amortecimento angular global moderado
        this.rbSimParamsF32[SP_PREDICTIVE_THRESHOLD]  = this.config?.predictiveThreshold  ?? 0.05;
        this.rbSimParamsF32[SP_RESTITUTION_THRESHOLD] = this.config?.restitutionThreshold ?? 2.0;
        this.rbSimParamsF32[SP_SLEEP_LIN_THRESHOLD]   = this.config?.sleepLinThreshold    ?? 0.01;
        this.rbSimParamsF32[SP_BAUMGARTE_BETA]        = this.config?.baumgarteBeta        ?? 0.5;
        this.rbSimParamsF32[SP_WARM_START_FACTOR]     = this.config?.warmStartFactor      ?? 0.85;

        let simParamsDirty = false;
        for (let i = 0; i < 20; i++) {
            if (this.rbSimParamsF32[i] !== this.prevSimParamsF32[i]) {
                simParamsDirty = true;
                break;
            }
        }
        if (simParamsDirty) {
            buffers.writeBuffer(RIGID_BODY_GLOBAL_BUFFER_SET.simParamsId, this.rbSimParamsF32);
            this.prevSimParamsF32.set(this.rbSimParamsF32);
        }
    }

    protected buildBindGroups(
        colliderCount: number,
        bodyCount:     number,
        maxContacts:   number,
    ): LcpBindGroups {
        const compute = this.core.compute;
        const bufs    = this.core.resources.buffers;

        const rbParamsBuf  = bufs.getBuffer(RIGID_BODY_GLOBAL_BUFFER_SET.simParamsId)!.native;
        const bodiesBuf    = bufs.getBuffer(RIGID_BODY_GLOBAL_BUFFER_SET.bodiesId)!.native;
        const contactsBuf  = bufs.getBuffer(RIGID_BODY_GLOBAL_BUFFER_SET.contactsId)!.native;
        const collidersBuf = bufs.getBuffer(COLLIDERS_BUFFER_ID)!.native;
        const bVecBuf      = bufs.getBuffer(RB_LCP_BIAS_BUFFER_ID)!.native;

        const bg = (id: string, entries: GPUBindGroupEntry[]) =>
            compute.createBindGroupFromPipeline(id, 0, entries, `bg_${id}_lcp`);

        const predict = bg(PIPELINE_IDS.RB_PREDICT, [
            { binding: 0, resource: { buffer: rbParamsBuf } },
            { binding: 1, resource: { buffer: bodiesBuf   } },
        ]);

        const updateColliders = bg(PIPELINE_IDS.RB_UPDATE_COLLIDERS, [
            { binding: 0, resource: { buffer: rbParamsBuf  } },
            { binding: 1, resource: { buffer: bodiesBuf    } },
            { binding: 2, resource: { buffer: collidersBuf } },
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

        const lcpCommit = bg(PIPELINE_IDS.RB_LCP_COMMIT, [
            { binding: 0, resource: { buffer: rbParamsBuf } },
            { binding: 1, resource: { buffer: bodiesBuf   } },
            { binding: 2, resource: { buffer: contactsBuf } },
        ]);

        return { predict, updateColliders, narrowphase, buildLcp, solveLcp, velocityRecovery, lcpCommit, syncTransform: null };
    }

    protected encodeAlgorithmPasses(
        encoder:       GPUCommandEncoder,
        bg:            LcpBindGroups,
        colliderCount: number,
        bodyCount:     number,
        maxContacts:   number,
        dtFrame:       number,
        substeps:      number,
        shouldProfile: boolean,
    ): void {
        const compute    = this.core.compute;
        const profiler   = this.phyProfiler;
        const wgBodies   = Math.ceil(bodyCount / 64);
        const wgContacts = Math.ceil(maxContacts / 64);
        const wgColliders = Math.ceil(Math.max(colliderCount, 1) / 64);

        // rb_predict — 1× por frame
        const predictPass = compute.beginComputePassExplicit(
            encoder, 'lcp_rb_predict', shouldProfile ? profiler.timestampWritesFor(PHYS_SLOTS.predict) : undefined);
        compute.dispatchOnPass(predictPass, PIPELINE_IDS.RB_PREDICT, [bg.predict], wgBodies);
        predictPass.end();

        // rb_update_colliders — 1× por frame
        const updateCollidersPass = compute.beginComputePassExplicit(encoder, 'lcp_rb_update_colliders');
        compute.dispatchOnPass(updateCollidersPass, PIPELINE_IDS.RB_UPDATE_COLLIDERS, [bg.updateColliders], wgColliders);
        updateCollidersPass.end();

        for (let s = 0; s < substeps; s++) {
            const isFirstSub = s === 0;

            const npPass = compute.beginComputePassExplicit(
                encoder, `lcp_rb_narrowphase_${s}`,
                isFirstSub && shouldProfile ? profiler.timestampWritesFor(PHYS_SLOTS.narrowphase) : undefined);
            compute.dispatchOnPass(npPass, PIPELINE_IDS.RB_NARROWPHASE, [bg.narrowphase], wgContacts);
            npPass.end();

            const buildPass = compute.beginComputePassExplicit(encoder, `lcp_rb_build_lcp_${s}`);
            compute.dispatchOnPass(buildPass, PIPELINE_IDS.RB_BUILD_LCP, [bg.buildLcp], wgContacts);
            buildPass.end();

            const solvePass = compute.beginComputePassExplicit(
                encoder, `lcp_rb_solve_lcp_${s}`,
                isFirstSub && shouldProfile ? profiler.timestampWritesFor(PHYS_SLOTS.solve) : undefined);
            compute.dispatchOnPass(solvePass, PIPELINE_IDS.RB_SOLVE_LCP, [bg.solveLcp], 1);
            solvePass.end();
        }

        // rb_lcp_commit — 1× por frame (substitui rb_velocity_recovery para pipeline LCP)
        const commitPass = compute.beginComputePassExplicit(
            encoder, 'lcp_rb_commit',
            shouldProfile ? profiler.timestampWritesFor(PHYS_SLOTS.velocityRecovery) : undefined);
        compute.dispatchOnPass(commitPass, PIPELINE_IDS.RB_LCP_COMMIT, [bg.lcpCommit], wgBodies);
        commitPass.end();
    }

    // ── Helpers de syncTransform (armazenado dentro de LcpBindGroups) ─────

    protected override hasSyncTransform(): boolean {
        return this.bgCache?.syncTransform != null;
    }

    protected override setSyncTransform(bg: GPUBindGroup): void {
        if (this.bgCache) this.bgCache.syncTransform = bg;
    }

    protected override getSyncTransform(): GPUBindGroup | null {
        return this.bgCache?.syncTransform ?? null;
    }
}
