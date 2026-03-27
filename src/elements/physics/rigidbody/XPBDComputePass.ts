/**
 * XPBDComputePass — pipeline GPU para simulação de corpos rígidos XPBD.
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

import type { Force }                 from '../../../scene/systems/forces/Force';
import type { RigidBodySimConfig }    from '../../../scene/systems/simulation/RigidBodySimConfig';
import { COLLIDERS_BUFFER_ID }        from '../shared/ColliderDescriptorUploader';
import { RIGID_BODY_GLOBAL_BUFFER_SET } from './RigidBodyGlobalBufferSet';
import { PIPELINE_IDS }               from '../shared/ShaderLibrary';
import { PHYS_SLOTS }                 from './Profiler';
import type { GpuPipelineEventBus }   from '../../../scene/systems/gpu/GpuPipelineEventBus';
import {
    SP_GRAVITY_X, SP_GRAVITY_Y, SP_GRAVITY_Z,
    SP_DT, SP_BODY_COUNT, SP_COLLIDER_COUNT, SP_MAX_CONTACTS, SP_SOLVE_ITERS,
    SP_DT_FRAME, SP_RESTITUTION, SP_PENETRATION_SLOP,
    SP_LINEAR_DAMPING, SP_ANGULAR_DAMPING,
    SP_PREDICTIVE_THRESHOLD, SP_RESTITUTION_THRESHOLD, SP_SLEEP_LIN_THRESHOLD,
} from './SimParamsLayout';
import { ComputePassBase } from './ComputePassBase';

type RbBindGroups = {
    predict:          GPUBindGroup;
    updateColliders:  GPUBindGroup;
    narrowphase:      GPUBindGroup;
    solve:            GPUBindGroup;
    velocityRecovery: GPUBindGroup;
    syncTransform:    GPUBindGroup | null;
};

export class XPBDComputePass extends ComputePassBase<RbBindGroups> {

    public readonly passId = 'XPBDRigidBody';
    public readonly acceptedPhysicTypes: readonly string[] = ['RigidBody'];

    constructor(
        globalForces:    Map<string, Force>,
        getSubsteps:     () => number,
        solveIterations: number = 10,
        logInterval:     number = 60,
        config?:         RigidBodySimConfig,
        eventBus?:       GpuPipelineEventBus,
    ) {
        super(globalForces, getSubsteps, solveIterations, logInterval, config, eventBus);
    }

    // ── Métodos abstratos ─────────────────────────────────────────────────

    protected encodeSimParams(
        colliderCount: number,
        bodyCount:     number,
        maxContacts:   number,
        dtFrame:       number,
        dtSub:         number,
    ): void {
        const core    = this.core;
        const buffers = core.resources.buffers;

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
        this.rbSimParamsF32[SP_RESTITUTION]           = 0.1;
        this.rbSimParamsF32[SP_PENETRATION_SLOP]      = 0.005;
        this.rbSimParamsF32[SP_LINEAR_DAMPING]        = 4.0;
        this.rbSimParamsF32[SP_ANGULAR_DAMPING]       = 4.0;
        this.rbSimParamsF32[SP_PREDICTIVE_THRESHOLD]  = this.config?.predictiveThreshold  ?? 0.1;
        this.rbSimParamsF32[SP_RESTITUTION_THRESHOLD] = this.config?.restitutionThreshold ?? 2.0;
        this.rbSimParamsF32[SP_SLEEP_LIN_THRESHOLD]   = this.config?.sleepLinThreshold    ?? 0.01;

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
    ): RbBindGroups {
        const compute = this.core.compute;
        const bufs    = this.core.resources.buffers;

        const rbParamsBuf  = bufs.getBuffer(RIGID_BODY_GLOBAL_BUFFER_SET.simParamsId)!.native;
        const bodiesBuf    = bufs.getBuffer(RIGID_BODY_GLOBAL_BUFFER_SET.bodiesId)!.native;
        const contactsBuf  = bufs.getBuffer(RIGID_BODY_GLOBAL_BUFFER_SET.contactsId)!.native;
        const collidersBuf = bufs.getBuffer(COLLIDERS_BUFFER_ID)!.native;

        const bg = (id: string, entries: GPUBindGroupEntry[]) =>
            compute.createBindGroupFromPipeline(id, 0, entries, `bg_${id}_rb`);

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

        const solve = bg(PIPELINE_IDS.RB_SOLVE, [
            { binding: 0, resource: { buffer: rbParamsBuf } },
            { binding: 1, resource: { buffer: bodiesBuf   } },
            { binding: 2, resource: { buffer: contactsBuf } },
        ]);

        const velocityRecovery = bg(PIPELINE_IDS.RB_VELOCITY_RECOVERY, [
            { binding: 0, resource: { buffer: rbParamsBuf } },
            { binding: 1, resource: { buffer: bodiesBuf   } },
        ]);

        return { predict, updateColliders, narrowphase, solve, velocityRecovery, syncTransform: null };
    }

    protected encodeAlgorithmPasses(
        encoder:       GPUCommandEncoder,
        bg:            RbBindGroups,
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

        // rb_predict — 1× por frame, antes do loop de substeps
        const predictPass = compute.beginComputePassExplicit(
            encoder, 'rb_predict', shouldProfile ? profiler.timestampWritesFor(PHYS_SLOTS.predict) : undefined);
        compute.dispatchOnPass(predictPass, PIPELINE_IDS.RB_PREDICT, [bg.predict], wgBodies);
        predictPass.end();

        // rb_update_colliders — 1× por frame
        const updateCollidersPass = compute.beginComputePassExplicit(encoder, 'rb_update_colliders');
        compute.dispatchOnPass(updateCollidersPass, PIPELINE_IDS.RB_UPDATE_COLLIDERS, [bg.updateColliders], wgColliders);
        updateCollidersPass.end();

        for (let s = 0; s < substeps; s++) {
            const isFirstSub = s === 0;

            const npPass = compute.beginComputePassExplicit(
                encoder, `rb_narrowphase_${s}`,
                isFirstSub && shouldProfile ? profiler.timestampWritesFor(PHYS_SLOTS.narrowphase) : undefined);
            compute.dispatchOnPass(npPass, PIPELINE_IDS.RB_NARROWPHASE, [bg.narrowphase], wgContacts);
            npPass.end();

            const solvePass = compute.beginComputePassExplicit(
                encoder, `rb_solve_${s}`,
                isFirstSub && shouldProfile ? profiler.timestampWritesFor(PHYS_SLOTS.solve) : undefined);
            compute.dispatchOnPass(solvePass, PIPELINE_IDS.RB_SOLVE, [bg.solve], 1);
            solvePass.end();
        }

        const vrPass = compute.beginComputePassExplicit(
            encoder, 'rb_velocity_recovery',
            shouldProfile ? profiler.timestampWritesFor(PHYS_SLOTS.velocityRecovery) : undefined);
        compute.dispatchOnPass(vrPass, PIPELINE_IDS.RB_VELOCITY_RECOVERY, [bg.velocityRecovery], wgBodies);
        vrPass.end();
    }

    // ── Helpers de syncTransform (armazenado dentro de RbBindGroups) ──────

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
