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
import simParamsStruct from '../../gpu/wgsl/structs/sim_params.wgsl?raw';
import particleStruct from '../../gpu/wgsl/structs/particle.wgsl?raw';
import xpbdMath from '../../gpu/wgsl/math/xpbd.wgsl?raw';
import predictKernel from '../../gpu/wgsl/kernels/predict.wgsl?raw';
import velocityUpdateKernel from '../../gpu/wgsl/kernels/velocity_update.wgsl?raw';

export interface XPBDFlowOptions {
    readonly bodyType?: string;
    readonly fixedDt?: number;
    readonly substeps?: number;
}

export class XPBDFlow extends Flow {
    readonly type = 'XPBDFlow';
    readonly bodyType: string;
    readonly phase: Phase = 'physics';
    override priority = 5;

    private readonly fixedDt: number;
    private readonly substeps: number;
    private readonly poolKey: string;

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
        options: XPBDFlowOptions = {},
    ) {
        super();
        this.bodyType = options.bodyType ?? 'SoftBody:XPBD';
        this.fixedDt = options.fixedDt ?? 1 / 60;
        this.substeps = Math.max(1, options.substeps ?? 1);
        this.poolKey = this.bodyType;
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [
            {
                id: 'pipeline_xpbd_predict',
                role: 'compute',
                shaderSource: [simParamsStruct, particleStruct, xpbdMath, predictKernel].join('\n'),
                entryPoints: ['predict_main'],
                consumes: [this.bodyType, 'GravityField'],
            },
            {
                id: 'pipeline_xpbd_velocity_update',
                role: 'compute',
                shaderSource: [simParamsStruct, particleStruct, velocityUpdateKernel].join('\n'),
                entryPoints: ['velocity_update_main'],
                consumes: [this.bodyType],
            },
        ];
    }

    override isReady(): boolean {
        return this.resources.poolCount(this.poolKey) > 0;
    }

    override onPoolReallocated(poolKey: string): void {
        if (poolKey === this.poolKey) {
            this.bindGroup = null;
        }
    }

    private ensureGpuObjects(): void {
        if (this.predictShader === null) {
            this.predictShader = this.core.create<ShaderModuleSpec>({
                kind: 'shader',
                discriminator: 'xpbd_predict_shader',
                source: [simParamsStruct, particleStruct, xpbdMath, predictKernel].join('\n'),
            });
        }
        if (this.velUpdateShader === null) {
            this.velUpdateShader = this.core.create<ShaderModuleSpec>({
                kind: 'shader',
                discriminator: 'xpbd_velocity_update_shader',
                source: [simParamsStruct, particleStruct, velocityUpdateKernel].join('\n'),
            });
        }
        if (this.paramsBuffer === null) {
            this.paramsBuffer = this.core.create<UniformBufferSpec>({
                kind: 'buffer',
                subkind: 'uniform',
                discriminator: 'xpbd_sim_params',
                byteSize: 64,
            });
        }
        if (this.bindLayout === null) {
            this.bindLayout = this.core.create<LayoutSpec>({
                kind: 'layout',
                discriminator: 'xpbd_layout',
                entries: [
                    { binding: 0, visibility: GPUShaderStage.COMPUTE, kind: 'buffer', type: 'uniform' },
                    { binding: 1, visibility: GPUShaderStage.COMPUTE, kind: 'buffer', type: 'storage' },
                ],
            });
        }
        const bodiesBuf = this.resources.poolBufferSpec(this.poolKey);
        if (bodiesBuf === undefined) return;
        if (this.bindGroup === null) {
            this.bindGroup = this.core.create<BindGroupSpec>({
                kind: 'bindgroup',
                discriminator: 'xpbd_bg',
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
                discriminator: 'xpbd_predict_pipeline',
                layouts: [this.bindLayout],
                shader: this.predictShader,
                entryPoint: 'predict_main',
            });
        }
        if (this.velUpdatePipeline === null) {
            this.velUpdatePipeline = this.core.create<ComputePipelineSpec>({
                kind: 'pipeline', subkind: 'compute',
                discriminator: 'xpbd_velocity_update_pipeline',
                layouts: [this.bindLayout],
                shader: this.velUpdateShader,
                entryPoint: 'velocity_update_main',
            });
        }
    }

    private uploadParams(particleCount: number, dtSub: number): void {
        if (this.paramsBuffer === null) return;
        const gravity = this.findGravityField();
        const accel = (gravity?.data['acceleration'] as readonly number[] | undefined) ?? [0, -9.81, 0, 0];
        // SimParams (WGSL natural layout, vec3 size=12 align=16):
        //   gravity vec3f @ 0..12 (size 12)
        //   dt f32 @ 12..16
        //   restitution @ 16, damping @ 20, particle_radius @ 24
        //   particle_count u32 @ 28, constraint_count u32 @ 32, collider_count u32 @ 36
        //   shape_stiffness @ 40, collision_radius @ 44
        //   stride aligned to 16 = 48 (we allocate 64 for safety)
        const buf = new ArrayBuffer(64);
        const f32 = new Float32Array(buf);
        const u32 = new Uint32Array(buf);
        f32[0] = accel[0] ?? 0;
        f32[1] = accel[1] ?? -9.81;
        f32[2] = accel[2] ?? 0;
        f32[3] = dtSub;            // dt @ offset 12
        f32[4] = 0.2;              // restitution @ 16
        f32[5] = 0.05;             // damping @ 20
        f32[6] = 0.05;             // particle_radius @ 24
        u32[7] = particleCount;    // particle_count @ 28
        u32[8] = 0;                // constraint_count @ 32
        u32[9] = 0;                // collider_count @ 36
        f32[10] = 0;               // shape_stiffness @ 40
        f32[11] = 0;               // collision_radius @ 44
        this.core.write(this.paramsBuffer, new Uint8Array(buf));
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
        const count = this.resources.poolCount(this.poolKey);
        if (count === 0) return;
        this.ensureGpuObjects();
        if (this.predictPipeline === null || this.velUpdatePipeline === null || this.bindGroup === null) return;
        const dtSub = this.fixedDt / this.substeps;
        const wgs = Math.ceil(count / 64);
        for (let s = 0; s < this.substeps; s++) {
            this.uploadParams(count, dtSub);
            frame.compute('XPBDFlow.predict', pass => {
                pass.bind
                    .setPipeline(this.predictPipeline as ComputePipelineSpec)
                    .setBindGroup(0, this.bindGroup as BindGroupSpec);
                pass.dispatch.workgroups(wgs);
            });
            frame.compute('XPBDFlow.velocity_update', pass => {
                pass.bind
                    .setPipeline(this.velUpdatePipeline as ComputePipelineSpec)
                    .setBindGroup(0, this.bindGroup as BindGroupSpec);
                pass.dispatch.workgroups(wgs);
            });
        }
    }
}
