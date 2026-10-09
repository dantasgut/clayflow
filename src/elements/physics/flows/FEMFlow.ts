import type { EngineCore, Frame } from '../../../core/contracts/index';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
import type { Phase } from '../../../scene/flows/Flow';
import {
    createComputeKernel,
    destroyComputeKernel,
    type ComputeKernel,
} from '../../../scene/flows/createComputeKernel';
import type { ResourceSystem } from '../../../scene/systems/ResourceSystem';
import type { World } from '../../../scene/world/World';
import { Time } from '../../../scene/time/Time';
import { PerStepUniforms } from './PerStepUniforms';
import type { GravityField } from '../forcefields/GravityField';
import femSimParamsStruct from '../../gpu/wgsl/structs/fem_sim_params.wgsl?raw';
import particleStruct from '../../gpu/wgsl/structs/particle.wgsl?raw';
import femPredictKernel from '../../gpu/wgsl/kernels/fem_predict.wgsl?raw';
import femVelocityUpdateKernel from '../../gpu/wgsl/kernels/fem_velocity_update.wgsl?raw';

export interface FEMFlowOptions {
    /** Substeps por passo de física (default 1). O passo vem do `Time` da cena. */
    readonly substeps?: number;
    readonly mu?: number;
    readonly lambda?: number;
    readonly damping?: number;
}

/** Bytes do struct `FEMSimParams`. */
const FEM_SIM_PARAMS_BYTE_SIZE = 96;

/**
 * FEMFlow — corpos macios por elementos finitos (predict + atualização de velocidade). O quadro executa
 * `time.steps × substeps` iterações, cada uma com a sua região de `FEMSimParams` (`dt_sub = stepDt / substeps`,
 * `dt_frame = stepDt`) ligada por offset dinâmico.
 */
export class FEMFlow extends Flow {
    readonly type = 'FEMFlow';
    readonly bodyType = 'FEMSchema';
    readonly phase: Phase = 'physics';

    private readonly substeps: number;
    private readonly mu: number;
    private readonly lambda: number;
    private readonly damping: number;

    private readonly params: PerStepUniforms;
    private predictKernel: ComputeKernel | null = null;
    private velUpdateKernel: ComputeKernel | null = null;

    constructor(
        private readonly core: EngineCore,
        private readonly world: World,
        private readonly resources: ResourceSystem,
        options: FEMFlowOptions = {},
    ) {
        super();
        this.substeps = Math.max(1, options.substeps ?? 1);
        this.mu = options.mu ?? 5e3;
        this.lambda = options.lambda ?? 5e3;
        this.damping = options.damping ?? 0.05;
        this.params = new PerStepUniforms(core, {
            discriminator: 'fem_sim_params',
            byteSize: FEM_SIM_PARAMS_BYTE_SIZE,
        });
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [
            {
                id: 'pipeline_fem_predict',
                role: 'compute',
                shaderSource: [femSimParamsStruct, particleStruct, femPredictKernel].join('\n'),
                entryPoints: ['fem_predict_main'],
                consumes: [this.bodyType, 'GravityField'],
            },
            {
                id: 'pipeline_fem_velocity_update',
                role: 'compute',
                shaderSource: [femSimParamsStruct, particleStruct, femVelocityUpdateKernel].join(
                    '\n',
                ),
                entryPoints: ['fem_velocity_update_main'],
                consumes: [this.bodyType],
            },
        ];
    }

    override isReady(): boolean {
        return this.resources.poolCount(this.bodyType) > 0;
    }

    override onPoolReallocated(poolKey: string): void {
        if (poolKey === this.bodyType) this.invalidateKernels();
    }

    /** Libera e esquece os kernels (bind groups dependem de buffers que mudaram). */
    private invalidateKernels(): void {
        if (this.predictKernel !== null) destroyComputeKernel(this.core, this.predictKernel);
        if (this.velUpdateKernel !== null) destroyComputeKernel(this.core, this.velUpdateKernel);
        this.predictKernel = null;
        this.velUpdateKernel = null;
    }

    private ensureGpuObjects(): void {
        if (this.predictKernel !== null && this.velUpdateKernel !== null) return;
        const bodiesBuf = this.resources.poolBufferSpec(this.bodyType);
        if (bodiesBuf === undefined) return;
        const bindings = [
            this.params.binding(0),
            { binding: 1, type: 'storage' as const, buffer: bodiesBuf },
        ];
        if (this.predictKernel === null) {
            this.predictKernel = createComputeKernel(this.core, {
                discriminator: 'fem_predict',
                shaderSource: [femSimParamsStruct, particleStruct, femPredictKernel].join('\n'),
                entryPoint: 'fem_predict_main',
                bindings,
            });
        }
        if (this.velUpdateKernel === null) {
            this.velUpdateKernel = createComputeKernel(this.core, {
                discriminator: 'fem_velocity_update',
                shaderSource: [femSimParamsStruct, particleStruct, femVelocityUpdateKernel].join(
                    '\n',
                ),
                entryPoint: 'fem_velocity_update_main',
                bindings,
            });
        }
    }

    /** Preenche a região `region` de `FEMSimParams` com o `dt` da iteração e do passo. */
    private fillParams(
        region: number,
        nodeCount: number,
        dtSub: number,
        stepDt: number,
        accel: readonly number[],
    ): void {
        const f32 = this.params.f32(region);
        const u32 = this.params.u32(region);
        f32[0] = accel[0] ?? 0;
        f32[1] = accel[1] ?? -9.81;
        f32[2] = accel[2] ?? 0;
        f32[3] = dtSub; // dt_sub @ 12
        f32[4] = this.mu; // mu @ 16
        f32[5] = this.lambda; // lambda @ 20
        f32[6] = this.damping; // damping @ 24
        f32[7] = 0; // collision_radius @ 28
        f32[8] = 1.0 / Math.max(this.lambda + 2 * this.mu, 1e-6); // alpha_h @ 32
        f32[9] = 1.0 / Math.max(this.mu, 1e-6); // alpha_d @ 36
        f32[10] = stepDt; // dt_frame @ 40
        f32[11] = 0.2; // restitution @ 44
        u32[12] = 0; // collider_count @ 48
        u32[13] = nodeCount; // node_count @ 52
        u32[14] = 0; // elem_count @ 56
        u32[15] = 4; // solve_iters @ 60
        u32[16] = 0; // rb_count @ 64
    }

    private findGravity(): GravityField | null {
        const ids = this.world.queryBySchemaName('GravityField');
        const first = ids[0];
        if (first === undefined) return null;
        return (this.world
            .resourcesOf(first)
            .find(
                (r) =>
                    (r.constructor as { schema?: { name: string } }).schema?.name
                    === 'GravityField',
            ) ?? null) as GravityField | null;
    }

    dispatch(frame: Frame): void {
        const time = this.world.findResource(Time.schema, Time);
        const steps = time?.steps ?? 0;
        if (time === undefined || steps === 0) return;
        const count = this.resources.poolCount(this.bodyType);
        if (count === 0) return;
        const iterations = steps * this.substeps;
        if (this.params.reserve(iterations)) this.invalidateKernels();
        const accel = (this.findGravity()?.data.acceleration as readonly number[] | undefined) ?? [
            0, -9.81, 0, 0,
        ];
        for (let i = 0; i < iterations; i++) {
            this.fillParams(i, count, time.stepDt / this.substeps, time.stepDt, accel);
        }
        this.params.flush(iterations);

        this.ensureGpuObjects();
        if (this.predictKernel === null || this.velUpdateKernel === null) return;
        const predict = this.predictKernel;
        const velUpdate = this.velUpdateKernel;
        const wgs = Math.ceil(count / 64);
        for (let i = 0; i < iterations; i++) {
            const offset = [this.params.offset(i)];
            frame.compute('FEMFlow.predict', (pass) => {
                pass.bind.setPipeline(predict.pipeline).setBindGroup(0, predict.bindGroup, offset);
                pass.dispatch.workgroups(wgs);
            });
            frame.compute('FEMFlow.velocity_update', (pass) => {
                pass.bind
                    .setPipeline(velUpdate.pipeline)
                    .setBindGroup(0, velUpdate.bindGroup, offset);
                pass.dispatch.workgroups(wgs);
            });
        }
    }
}
