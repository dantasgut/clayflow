import type {
    BindGroupSpec,
    ComputePipelineSpec,
    EngineCore,
    Frame,
    LayoutSpec,
    ShaderModuleSpec,
    UniformBufferSpec,
} from '../../../core/contracts/index';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
import type { Phase } from '../../../scene/flows/Flow';
import type { ResourceSystem } from '../../../scene/systems/ResourceSystem';
import type { World } from '../../../scene/world/World';
import type { GravityField } from '../forcefields/GravityField';
import femSimParamsStruct from '../../gpu/wgsl/structs/fem_sim_params.wgsl?raw';
import particleStruct from '../../gpu/wgsl/structs/particle.wgsl?raw';
import femPredictKernel from '../../gpu/wgsl/kernels/fem_predict.wgsl?raw';
import femVelocityUpdateKernel from '../../gpu/wgsl/kernels/fem_velocity_update.wgsl?raw';

export interface FEMFlowOptions {
    readonly fixedDt?: number;
    readonly substeps?: number;
    readonly mu?: number;
    readonly lambda?: number;
    readonly damping?: number;
}

export class FEMFlow extends Flow {
    readonly type = 'FEMFlow';
    readonly bodyType = 'SoftBody:FEM';
    readonly phase: Phase = 'physics';

    private readonly fixedDt: number;
    private readonly substeps: number;
    private readonly mu: number;
    private readonly lambda: number;
    private readonly damping: number;

    private predictShader: ShaderModuleSpec | null = null;
    private velUpdateShader: ShaderModuleSpec | null = null;
    private paramsBuffer: UniformBufferSpec | null = null;
    private bindLayout: LayoutSpec | null = null;
    private bindGroup: BindGroupSpec | null = null;
    private predictPipeline: ComputePipelineSpec | null = null;
    private velUpdatePipeline: ComputePipelineSpec | null = null;

    constructor(
        private readonly core: EngineCore,
        private readonly world: World,
        private readonly resources: ResourceSystem,
        options: FEMFlowOptions = {},
    ) {
        super();
        this.fixedDt = options.fixedDt ?? 1 / 60;
        this.substeps = Math.max(1, options.substeps ?? 1);
        this.mu = options.mu ?? 5e3;
        this.lambda = options.lambda ?? 5e3;
        this.damping = options.damping ?? 0.05;
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [
            {
                id: 'pipeline_fem_predict', role: 'compute',
                shaderSource: [femSimParamsStruct, particleStruct, femPredictKernel].join('\n'),
                entryPoints: ['fem_predict_main'],
                consumes: [this.bodyType, 'GravityField'],
            },
            {
                id: 'pipeline_fem_velocity_update', role: 'compute',
                shaderSource: [femSimParamsStruct, particleStruct, femVelocityUpdateKernel].join('\n'),
                entryPoints: ['fem_velocity_update_main'],
                consumes: [this.bodyType],
            },
        ];
    }

    override isReady(): boolean {
        return this.resources.poolCount(this.bodyType) > 0;
    }

    private ensureGpuObjects(): void {
        if (this.predictShader === null) {
            this.predictShader = this.core.create<ShaderModuleSpec>({
                kind: 'shader', discriminator: 'fem_predict_shader',
                source: [femSimParamsStruct, particleStruct, femPredictKernel].join('\n'),
            });
        }
        if (this.velUpdateShader === null) {
            this.velUpdateShader = this.core.create<ShaderModuleSpec>({
                kind: 'shader', discriminator: 'fem_velocity_update_shader',
                source: [femSimParamsStruct, particleStruct, femVelocityUpdateKernel].join('\n'),
            });
        }
        if (this.paramsBuffer === null) {
            this.paramsBuffer = this.core.create<UniformBufferSpec>({
                kind: 'buffer', subkind: 'uniform',
                discriminator: 'fem_sim_params', byteSize: 96,
            });
        }
        if (this.bindLayout === null) {
            this.bindLayout = this.core.create<LayoutSpec>({
                kind: 'layout', discriminator: 'fem_layout',
                entries: [
                    { binding: 0, visibility: GPUShaderStage.COMPUTE, kind: 'buffer', type: 'uniform' },
                    { binding: 1, visibility: GPUShaderStage.COMPUTE, kind: 'buffer', type: 'storage' },
                ],
            });
        }
        const bodiesBuf = this.resources.poolBufferSpec(this.bodyType);
        if (bodiesBuf === undefined) return;
        if (this.bindGroup === null) {
            this.bindGroup = this.core.create<BindGroupSpec>({
                kind: 'bindgroup', discriminator: 'fem_bg',
                layout: this.bindLayout,
                bindings: [
                    { binding: 0, kind: 'buffer', buffer: this.paramsBuffer },
                    { binding: 1, kind: 'buffer', buffer: bodiesBuf },
                ],
            });
        }
        if (this.predictPipeline === null) {
            this.predictPipeline = this.core.create<ComputePipelineSpec>({
                kind: 'pipeline', subkind: 'compute',
                discriminator: 'fem_predict_pipeline',
                layouts: [this.bindLayout], shader: this.predictShader, entryPoint: 'fem_predict_main',
            });
        }
        if (this.velUpdatePipeline === null) {
            this.velUpdatePipeline = this.core.create<ComputePipelineSpec>({
                kind: 'pipeline', subkind: 'compute',
                discriminator: 'fem_velocity_update_pipeline',
                layouts: [this.bindLayout], shader: this.velUpdateShader, entryPoint: 'fem_velocity_update_main',
            });
        }
    }

    private uploadParams(nodeCount: number, dtSub: number): void {
        if (this.paramsBuffer === null) return;
        const gravity = this.findGravity();
        const accel = (gravity?.data['acceleration'] as readonly number[] | undefined) ?? [0, -9.81, 0, 0];
        const buf = new ArrayBuffer(96);
        const f32 = new Float32Array(buf);
        const u32 = new Uint32Array(buf);
        f32[0] = accel[0] ?? 0;
        f32[1] = accel[1] ?? -9.81;
        f32[2] = accel[2] ?? 0;
        f32[3] = dtSub;            // dt_sub @ 12
        f32[4] = this.mu;          // mu @ 16
        f32[5] = this.lambda;      // lambda @ 20
        f32[6] = this.damping;     // damping @ 24
        f32[7] = 0;                // collision_radius @ 28
        f32[8] = 1.0 / Math.max(this.lambda + 2 * this.mu, 1e-6); // alpha_h @ 32
        f32[9] = 1.0 / Math.max(this.mu, 1e-6);                   // alpha_d @ 36
        f32[10] = this.fixedDt;    // dt_frame @ 40
        f32[11] = 0.2;             // restitution @ 44
        u32[12] = 0;               // collider_count @ 48
        u32[13] = nodeCount;       // node_count @ 52
        u32[14] = 0;               // elem_count @ 56
        u32[15] = 4;               // solve_iters @ 60
        u32[16] = 0;               // rb_count @ 64
        this.core.write(this.paramsBuffer, new Uint8Array(buf));
    }

    private findGravity(): GravityField | null {
        const ids = this.world.queryBySchemaName('GravityField');
        const first = ids[0];
        if (first === undefined) return null;
        return (this.world.resourcesOf(first).find(r => (r.constructor as { schema?: { name: string } }).schema?.name === 'GravityField') ?? null) as GravityField | null;
    }

    dispatch(frame: Frame): void {
        const count = this.resources.poolCount(this.bodyType);
        if (count === 0) return;
        this.ensureGpuObjects();
        if (this.predictPipeline === null || this.velUpdatePipeline === null || this.bindGroup === null) return;
        const dtSub = this.fixedDt / this.substeps;
        const wgs = Math.ceil(count / 64);
        for (let s = 0; s < this.substeps; s++) {
            this.uploadParams(count, dtSub);
            frame.compute('FEMFlow.predict', pass => {
                pass.bind.setPipeline(this.predictPipeline as ComputePipelineSpec).setBindGroup(0, this.bindGroup as BindGroupSpec);
                pass.dispatch.workgroups(wgs);
            });
            frame.compute('FEMFlow.velocity_update', pass => {
                pass.bind.setPipeline(this.velUpdatePipeline as ComputePipelineSpec).setBindGroup(0, this.bindGroup as BindGroupSpec);
                pass.dispatch.workgroups(wgs);
            });
        }
    }
}
