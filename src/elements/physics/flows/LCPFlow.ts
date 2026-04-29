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
import rigidBodyStruct from '../../gpu/wgsl/structs/rigid_body.wgsl?raw';
import rbSimParamsStruct from '../../gpu/wgsl/structs/rb_sim_params.wgsl?raw';
import quatLib from '../../gpu/wgsl/math/quat.wgsl?raw';
import impulseLib from '../../gpu/wgsl/math/impulse.wgsl?raw';
import rbPredictKernel from '../../gpu/wgsl/kernels/rb_predict.wgsl?raw';

const PREDICT_SHADER = [rigidBodyStruct, rbSimParamsStruct, quatLib, impulseLib, rbPredictKernel].join('\n');

const RB_SIM_PARAMS_BYTE_SIZE = 80;

export interface LCPFlowOptions {
    readonly bodiesPoolKey?: string;
    readonly fixedDt?: number;
    readonly substeps?: number;
}

export class LCPFlow extends Flow {
    readonly type = 'LCPFlow';
    readonly bodyType = 'RigidBody:LCP';
    readonly phase: Phase = 'physics';
    override priority = 10;

    private readonly bodiesPoolKey: string;
    private readonly fixedDt: number;
    private readonly substeps: number;

    private shader: ShaderModuleSpec | null = null;
    private paramsBuffer: UniformBufferSpec | null = null;
    private bindGroupLayout: LayoutSpec | null = null;
    private bindGroup: BindGroupSpec | null = null;
    private pipeline: ComputePipelineSpec | null = null;

    constructor(
        private readonly core: EngineCore,
        private readonly world: World,
        private readonly resources: ResourceSystem,
        options: LCPFlowOptions = {},
    ) {
        super();
        this.bodiesPoolKey = options.bodiesPoolKey ?? 'RigidBody:LCP';
        this.fixedDt = options.fixedDt ?? 1 / 60;
        this.substeps = Math.max(1, options.substeps ?? 1);
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [{
            id: 'pipeline_lcp_predict',
            role: 'compute',
            shaderSource: PREDICT_SHADER,
            entryPoints: ['rb_predict_main'],
            consumes: ['RigidBody:LCP', 'GravityField'],
        }];
    }

    override isReady(): boolean {
        return this.resources.poolCount(this.bodiesPoolKey) > 0;
    }

    override onPoolReallocated(poolKey: string): void {
        if (poolKey === this.bodiesPoolKey) {
            this.bindGroup = null;
        }
    }

    private ensureGpuObjects(): void {
        if (this.shader === null) {
            this.shader = this.core.create<ShaderModuleSpec>({
                kind: 'shader',
                discriminator: 'lcp_predict_shader',
                source: PREDICT_SHADER,
            });
        }
        if (this.paramsBuffer === null) {
            this.paramsBuffer = this.core.create<UniformBufferSpec>({
                kind: 'buffer',
                subkind: 'uniform',
                discriminator: 'lcp_predict_params',
                byteSize: RB_SIM_PARAMS_BYTE_SIZE,
            });
        }
        if (this.bindGroupLayout === null) {
            this.bindGroupLayout = this.core.create<LayoutSpec>({
                kind: 'layout',
                discriminator: 'lcp_predict_layout',
                entries: [
                    { binding: 0, visibility: GPUShaderStage.COMPUTE, kind: 'buffer', type: 'uniform' },
                    { binding: 1, visibility: GPUShaderStage.COMPUTE, kind: 'buffer', type: 'storage' },
                ],
            });
        }
        const bodiesBufferSpec = this.resources.poolBufferSpec(this.bodiesPoolKey);
        if (bodiesBufferSpec === undefined) return;
        if (this.bindGroup === null) {
            this.bindGroup = this.core.create<BindGroupSpec>({
                kind: 'bindgroup',
                discriminator: 'lcp_predict_bg',
                layout: this.bindGroupLayout,
                bindings: [
                    { binding: 0, kind: 'buffer', buffer: this.paramsBuffer },
                    { binding: 1, kind: 'buffer', buffer: bodiesBufferSpec },
                ],
            });
        }
        if (this.pipeline === null) {
            this.pipeline = this.core.create<ComputePipelineSpec>({
                kind: 'pipeline',
                subkind: 'compute',
                discriminator: 'lcp_predict_pipeline',
                layouts: [this.bindGroupLayout],
                shader: this.shader,
                entryPoint: 'rb_predict_main',
            });
        }
    }

    private uploadParams(bodyCount: number, dtSub: number): void {
        if (this.paramsBuffer === null) return;
        const gravity = this.findGravityField();
        const accel = (gravity?.data['acceleration'] as readonly number[] | undefined) ?? [0, -9.81, 0, 0];
        const buffer = new ArrayBuffer(RB_SIM_PARAMS_BYTE_SIZE);
        const f32 = new Float32Array(buffer);
        const u32 = new Uint32Array(buffer);
        // gravity: vec4f at offset 0..16 (xyz = accel, w = dtSub)
        f32[0] = accel[0] ?? 0;
        f32[1] = accel[1] ?? -9.81;
        f32[2] = accel[2] ?? 0;
        f32[3] = dtSub;
        // body_count u32 @ offset 16
        u32[4] = bodyCount;
        // collider_count u32 @ offset 20
        u32[5] = 0;
        // max_contacts u32 @ offset 24
        u32[6] = 0;
        // solve_iters u32 @ offset 28
        u32[7] = 0;
        // dt_frame f32 @ offset 32
        f32[8] = this.fixedDt;
        // restitution f32 @ offset 36
        f32[9] = 0.2;
        // remaining params left as zero (slop, damping, predictive, sleep, baumgarte, warm_start)
        this.core.write(this.paramsBuffer, new Uint8Array(buffer));
    }

    private findGravityField(): GravityField | null {
        const ids = this.world.queryBySchemaName('GravityField');
        if (ids.length === 0) return null;
        const first = ids[0];
        if (first === undefined) return null;
        const resources = this.world.resourcesOf(first);
        return (resources.find(r => (r.constructor as { schema?: { name: string } }).schema?.name === 'GravityField') ?? null) as GravityField | null;
    }

    dispatch(frame: Frame): void {
        const bodyCount = this.resources.poolCount(this.bodiesPoolKey);
        if (bodyCount === 0) return;
        this.ensureGpuObjects();
        if (this.pipeline === null || this.bindGroup === null) return;
        const dtSub = this.fixedDt / this.substeps;
        const workgroups = Math.ceil(bodyCount / 64);
        for (let s = 0; s < this.substeps; s++) {
            this.uploadParams(bodyCount, dtSub);
            frame.compute('LCPFlow.predict', pass => {
                pass.bind
                    .setPipeline(this.pipeline as ComputePipelineSpec)
                    .setBindGroup(0, this.bindGroup as BindGroupSpec);
                pass.dispatch.workgroups(workgroups);
            });
        }
    }
}
