import type { EngineCore, Frame } from '../../../core/contracts/index';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { LegacyFlow as Flow } from '../../../scene/flows/LegacyFlow';
import type { Phase } from '../../../scene/flows/Phase';
import {
    createComputeKernel,
    destroyComputeKernel,
    type ComputeKernel,
} from '../../../scene/flows/createComputeKernel';
import type { ResourceSystem } from '../../../scene/systems/ResourceSystem';
import type { World } from '../../../scene/world/World';
import { Time } from '../../../scene/time/Time';
import { PerStepUniforms } from './PerStepUniforms';
import { SimParamsSchema } from '../schemas/simParams';
import { GravityField } from '../forcefields/GravityField';
import { xpbdDistanceSolve, xpbdPredict, xpbdVelocityUpdate } from '../shaders/xpbd';

export interface XPBDFlowOptions {
    readonly bodyType?: string;
    readonly constraintPoolKey?: string;
    /** Substeps por passo de física (default 1). O passo vem do `Time` da cena. */
    readonly substeps?: number;
    readonly solverIters?: number;
}

/** Bytes do struct `SimParams` (48, alocados 64). */

/**
 * XPBDFlow — corpos macios por XPBD (partículas + restrições de distância). O quadro executa
 * `time.steps × substeps` iterações (predict → solve → atualização de velocidade), cada uma com a sua região de
 * `SimParams` (`dt = time.stepDt / substeps`) ligada por offset dinâmico.
 */
export class XPBDFlow extends Flow {
    readonly type = 'XPBDFlow';
    readonly bodyType: string;
    readonly phase: Phase = 'physics';
    override priority = 5;

    private readonly substeps: number;
    private readonly solverIters: number;
    private readonly poolKey: string;
    private readonly constraintPoolKey: string | null;

    private readonly params: PerStepUniforms;
    private predictKernel: ComputeKernel | null = null;
    private velUpdateKernel: ComputeKernel | null = null;
    private distanceKernel: ComputeKernel | null = null;

    constructor(
        private readonly core: EngineCore,
        private readonly world: World,
        private readonly resources: ResourceSystem,
        options: XPBDFlowOptions = {},
    ) {
        super();
        this.bodyType = options.bodyType ?? 'XPBDSoftSchema';
        this.substeps = Math.max(1, options.substeps ?? 8);
        this.solverIters = Math.max(1, options.solverIters ?? 1);
        this.poolKey = this.bodyType;
        this.constraintPoolKey = options.constraintPoolKey ?? null;
        this.params = new PerStepUniforms(core, {
            discriminator: 'xpbd_sim_params',
            schema: SimParamsSchema,
        });
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        const list: PipelineDescriptor[] = [
            {
                id: 'pipeline_xpbd_predict',
                role: 'compute',
                shader: xpbdPredict,
                entryPoints: ['predict_main'],
                consumes: [this.bodyType, 'GravityField'],
            },
            {
                id: 'pipeline_xpbd_velocity_update',
                role: 'compute',
                shader: xpbdVelocityUpdate,
                entryPoints: ['velocity_update_main'],
                consumes: [this.bodyType],
            },
        ];
        if (this.constraintPoolKey !== null) {
            list.push({
                id: 'pipeline_xpbd_distance_solve',
                role: 'compute',
                shader: xpbdDistanceSolve,
                entryPoints: ['distance_solve_main'],
                consumes: [this.bodyType, this.constraintPoolKey],
            });
        }
        return list;
    }

    /** Descarte do estágio: libera kernels e parâmetros. */
    override dispose(): void {
        this.invalidateKernels();
        this.params.dispose();
    }

    override isReady(): boolean {
        return this.resources.poolCount(this.poolKey) > 0;
    }

    override onPoolReallocated(poolKey: string): void {
        if (poolKey === this.poolKey) this.invalidateKernels();
        if (poolKey === this.constraintPoolKey) this.invalidateDistanceKernel();
    }

    /** Libera e esquece os kernels (bind groups dependem de buffers que mudaram). */
    private invalidateKernels(): void {
        if (this.predictKernel !== null) destroyComputeKernel(this.core, this.predictKernel);
        if (this.velUpdateKernel !== null) destroyComputeKernel(this.core, this.velUpdateKernel);
        this.predictKernel = null;
        this.velUpdateKernel = null;
        this.invalidateDistanceKernel();
    }

    private invalidateDistanceKernel(): void {
        if (this.distanceKernel !== null) destroyComputeKernel(this.core, this.distanceKernel);
        this.distanceKernel = null;
    }

    private ensureGpuObjects(): void {
        const bodiesBuf = this.resources.poolBufferSpec(this.poolKey);
        if (bodiesBuf === undefined) return;
        const baseBindings = [
            this.params.binding(0),
            { binding: 1, type: 'storage' as const, buffer: bodiesBuf },
        ];
        if (this.predictKernel === null) {
            this.predictKernel = createComputeKernel(this.core, {
                discriminator: 'xpbd_predict',
                shader: xpbdPredict,
                entryPoint: 'predict_main',
                bindings: baseBindings,
            });
        }
        if (this.velUpdateKernel === null) {
            this.velUpdateKernel = createComputeKernel(this.core, {
                discriminator: 'xpbd_velocity_update',
                shader: xpbdVelocityUpdate,
                entryPoint: 'velocity_update_main',
                bindings: baseBindings,
            });
        }
        if (this.constraintPoolKey !== null && this.distanceKernel === null) {
            const constraintsBuf = this.resources.poolBufferSpec(this.constraintPoolKey);
            if (constraintsBuf === undefined) return;
            this.distanceKernel = createComputeKernel(this.core, {
                discriminator: 'xpbd_distance_solve',
                shader: xpbdDistanceSolve,
                entryPoint: 'distance_solve_main',
                bindings: [
                    ...baseBindings,
                    {
                        binding: 2,
                        type: 'read-only-storage' as const,
                        buffer: constraintsBuf,
                    },
                ],
            });
        }
    }

    /** Preenche a região `region` de `SimParams` com o `dt` da iteração. */
    private fillParams(
        region: number,
        particleCount: number,
        dtSub: number,
        accel: readonly number[],
    ): void {
        this.params.write(region, {
            gravity: [accel[0] ?? 0, accel[1] ?? -9.81, accel[2] ?? 0],
            dt: dtSub,
            restitution: 0.2,
            damping: 0.05,
            particle_radius: 0.05,
            particle_count: particleCount,
            constraint_count:
                this.constraintPoolKey !== null
                    ? this.resources.poolCount(this.constraintPoolKey)
                    : 0,
        });
    }

    dispatch(frame: Frame): void {
        const time = this.world.findResource(Time.schema, Time);
        const steps = time?.steps ?? 0;
        if (time === undefined || steps === 0) return;
        const count = this.resources.poolCount(this.poolKey);
        if (count === 0) return;
        const iterations = steps * this.substeps;
        if (this.params.reserve(iterations)) this.invalidateKernels();
        const dtSub = time.stepDt / this.substeps;
        const accel = (this.world.findResource(GravityField.schema, GravityField)?.data
            .acceleration as readonly number[] | undefined) ?? [0, -9.81, 0, 0];
        for (let i = 0; i < iterations; i++) this.fillParams(i, count, dtSub, accel);
        this.params.flush(iterations);

        this.ensureGpuObjects();
        if (this.predictKernel === null || this.velUpdateKernel === null) return;
        const predict = this.predictKernel;
        const velUpdate = this.velUpdateKernel;
        const distance = this.distanceKernel;
        const solveConstraints =
            distance !== null
            && this.constraintPoolKey !== null
            && this.resources.poolCount(this.constraintPoolKey) > 0;
        for (let i = 0; i < iterations; i++) {
            const offset = [this.params.offset(i)];
            frame.compute('XPBDFlow.predict', (pass) => {
                pass.bind.setPipeline(predict.pipeline).setBindGroup(0, predict.bindGroup, offset);
                pass.dispatch.invocations(count, 64);
            });
            if (solveConstraints) {
                for (let it = 0; it < this.solverIters; it++) {
                    frame.compute('XPBDFlow.distance_solve', (pass) => {
                        pass.bind
                            .setPipeline(distance.pipeline)
                            .setBindGroup(0, distance.bindGroup, offset);
                        pass.dispatch.workgroups(1);
                    });
                }
            }
            frame.compute('XPBDFlow.velocity_update', (pass) => {
                pass.bind
                    .setPipeline(velUpdate.pipeline)
                    .setBindGroup(0, velUpdate.bindGroup, offset);
                pass.dispatch.invocations(count, 64);
            });
        }
    }
}
