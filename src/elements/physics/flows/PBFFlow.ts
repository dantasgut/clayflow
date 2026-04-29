import type {
    BindGroupSpec,
    ComputePipelineSpec,
    EngineCore,
    Frame,
    LayoutSpec,
    ShaderModuleSpec,
    StorageBufferSpec,
    UniformBufferSpec,
} from '../../../core/contracts/index';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
import type { Phase } from '../../../scene/flows/Flow';
import type { ResourceSystem } from '../../../scene/systems/ResourceSystem';
import type { World } from '../../../scene/world/World';
import type { GravityField } from '../forcefields/GravityField';
import { NeighborSearchPipeline } from '../../gpu/NeighborSearchPipeline';
import pbfSimParamsStruct from '../../gpu/wgsl/structs/pbf_sim_params.wgsl?raw';
import pbfParticleStruct from '../../gpu/wgsl/structs/pbf_particle.wgsl?raw';
import colliderDescStruct from '../../gpu/wgsl/structs/collider_desc.wgsl?raw';
import sphKernelsLib from '../../gpu/wgsl/math/sph_kernels.wgsl?raw';
import pbfPredictKernel from '../../gpu/wgsl/kernels/pbf_predict.wgsl?raw';
import pbfDensityLambdaKernel from '../../gpu/wgsl/kernels/pbf_density_lambda.wgsl?raw';
import pbfPositionCorrectKernel from '../../gpu/wgsl/kernels/pbf_position_correct.wgsl?raw';
import pbfVelocityUpdateKernel from '../../gpu/wgsl/kernels/pbf_velocity_update.wgsl?raw';
import pbfXsphKernel from '../../gpu/wgsl/kernels/pbf_xsph.wgsl?raw';
import pbfVorticityKernel from '../../gpu/wgsl/kernels/pbf_vorticity.wgsl?raw';
import pbfCollisionKernel from '../../gpu/wgsl/kernels/pbf_collision.wgsl?raw';

const COLLIDER_DESC_SIZE = 160;

export interface PBFFlowOptions {
    readonly fixedDt?: number;
    readonly substeps?: number;
    readonly solverIters?: number;
    readonly maxNeighbors?: number;
}

export class PBFFlow extends Flow {
    readonly type = 'PBFFlow';
    readonly bodyType = 'FluidBody:PBF';
    readonly phase: Phase = 'physics';

    private readonly fixedDt: number;
    private readonly substeps: number;
    private readonly solverIters: number;
    private readonly maxNeighbors: number;

    private paramsBuffer: UniformBufferSpec | null = null;
    private neighborSearch: NeighborSearchPipeline | null = null;
    private collidersBuffer: StorageBufferSpec | null = null;
    private paramsLayout: LayoutSpec | null = null;
    private particlesLayout: LayoutSpec | null = null;
    private neighborsLayout: LayoutSpec | null = null;
    private collidersLayout: LayoutSpec | null = null;
    private paramsBg: BindGroupSpec | null = null;
    private particlesBg: BindGroupSpec | null = null;
    private neighborsBg: BindGroupSpec | null = null;
    private collidersBg: BindGroupSpec | null = null;
    private predictShader: ShaderModuleSpec | null = null;
    private densityLambdaShader: ShaderModuleSpec | null = null;
    private positionCorrectShader: ShaderModuleSpec | null = null;
    private velocityUpdateShader: ShaderModuleSpec | null = null;
    private xsphShader: ShaderModuleSpec | null = null;
    private vorticityShader: ShaderModuleSpec | null = null;
    private collisionShader: ShaderModuleSpec | null = null;
    private predictPipeline: ComputePipelineSpec | null = null;
    private densityLambdaPipeline: ComputePipelineSpec | null = null;
    private positionCorrectPipeline: ComputePipelineSpec | null = null;
    private velocityUpdatePipeline: ComputePipelineSpec | null = null;
    private xsphPipeline: ComputePipelineSpec | null = null;
    private vorticityPipeline: ComputePipelineSpec | null = null;
    private collisionPipeline: ComputePipelineSpec | null = null;

    constructor(
        private readonly core: EngineCore,
        private readonly world: World,
        private readonly resources: ResourceSystem,
        options: PBFFlowOptions = {},
    ) {
        super();
        this.fixedDt = options.fixedDt ?? 1 / 60;
        this.substeps = Math.max(1, options.substeps ?? 1);
        this.solverIters = Math.max(1, options.solverIters ?? 4);
        this.maxNeighbors = options.maxNeighbors ?? 64;
    }

    private base(): string {
        return [pbfSimParamsStruct, pbfParticleStruct, colliderDescStruct, sphKernelsLib].join('\n');
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        const b = this.base();
        return [
            { id: 'pipeline_pbf_predict', role: 'compute', shaderSource: b + '\n' + pbfPredictKernel, entryPoints: ['pbf_predict_main'], consumes: [this.bodyType, 'GravityField'] },
            { id: 'pipeline_pbf_density_lambda', role: 'compute', shaderSource: b + '\n' + pbfDensityLambdaKernel, entryPoints: ['pbf_density_lambda_main'], consumes: [this.bodyType] },
            { id: 'pipeline_pbf_position_correct', role: 'compute', shaderSource: b + '\n' + pbfPositionCorrectKernel, entryPoints: ['pbf_position_correct_main'], consumes: [this.bodyType] },
            { id: 'pipeline_pbf_velocity_update', role: 'compute', shaderSource: b + '\n' + pbfVelocityUpdateKernel, entryPoints: ['pbf_velocity_update_main'], consumes: [this.bodyType] },
            { id: 'pipeline_pbf_xsph', role: 'compute', shaderSource: b + '\n' + pbfXsphKernel, entryPoints: ['pbf_xsph_main'], consumes: [this.bodyType] },
            { id: 'pipeline_pbf_vorticity', role: 'compute', shaderSource: b + '\n' + pbfVorticityKernel, entryPoints: ['pbf_vorticity_main'], consumes: [this.bodyType] },
            { id: 'pipeline_pbf_collision', role: 'compute', shaderSource: b + '\n' + pbfCollisionKernel, entryPoints: ['pbf_collision_main'], consumes: [this.bodyType] },
        ];
    }

    override isReady(): boolean {
        return this.resources.poolCount(this.bodyType) > 0;
    }

    override onPoolReallocated(poolKey: string): void {
        if (poolKey === this.bodyType) {
            this.particlesBg = null;
            this.neighborsBg = null;
            this.neighborSearch?.invalidateParticlesBinding();
        }
    }

    private ensureGpuObjects(): void {
        const b = this.base();
        if (this.predictShader === null)         this.predictShader = this.core.create<ShaderModuleSpec>({ kind: 'shader', discriminator: 'pbf_predict', source: b + '\n' + pbfPredictKernel });
        if (this.densityLambdaShader === null)   this.densityLambdaShader = this.core.create<ShaderModuleSpec>({ kind: 'shader', discriminator: 'pbf_density_lambda', source: b + '\n' + pbfDensityLambdaKernel });
        if (this.positionCorrectShader === null) this.positionCorrectShader = this.core.create<ShaderModuleSpec>({ kind: 'shader', discriminator: 'pbf_position_correct', source: b + '\n' + pbfPositionCorrectKernel });
        if (this.velocityUpdateShader === null)  this.velocityUpdateShader = this.core.create<ShaderModuleSpec>({ kind: 'shader', discriminator: 'pbf_velocity_update', source: b + '\n' + pbfVelocityUpdateKernel });
        if (this.xsphShader === null)            this.xsphShader = this.core.create<ShaderModuleSpec>({ kind: 'shader', discriminator: 'pbf_xsph', source: b + '\n' + pbfXsphKernel });
        if (this.vorticityShader === null)       this.vorticityShader = this.core.create<ShaderModuleSpec>({ kind: 'shader', discriminator: 'pbf_vorticity', source: b + '\n' + pbfVorticityKernel });
        if (this.collisionShader === null)       this.collisionShader = this.core.create<ShaderModuleSpec>({ kind: 'shader', discriminator: 'pbf_collision', source: b + '\n' + pbfCollisionKernel });

        if (this.paramsBuffer === null) this.paramsBuffer = this.core.create<UniformBufferSpec>({ kind: 'buffer', subkind: 'uniform', discriminator: 'pbf_params', byteSize: 96 });
        if (this.neighborSearch === null) {
            this.neighborSearch = new NeighborSearchPipeline(this.core, {
                discriminator: 'pbf',
                maxParticles: 65536,
                maxNeighbors: this.maxNeighbors,
                particleStrideF32: 16,
                cellSize: 0.1,
                gridDim: [32, 32, 32],
                origin: [-1.6, -1.6, -1.6],
            });
        }
        if (this.collidersBuffer === null) this.collidersBuffer = this.core.create<StorageBufferSpec>({ kind: 'buffer', subkind: 'storage', discriminator: 'pbf_colliders', byteSize: COLLIDER_DESC_SIZE });

        if (this.paramsLayout === null) this.paramsLayout = this.core.create<LayoutSpec>({ kind: 'layout', discriminator: 'pbf_params_layout', entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, kind: 'buffer', type: 'uniform' }] });
        if (this.particlesLayout === null) this.particlesLayout = this.core.create<LayoutSpec>({ kind: 'layout', discriminator: 'pbf_particles_layout', entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, kind: 'buffer', type: 'storage' }] });
        if (this.neighborsLayout === null) this.neighborsLayout = this.core.create<LayoutSpec>({
            kind: 'layout', discriminator: 'pbf_neighbors_layout',
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, kind: 'buffer', type: 'read-only-storage' },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, kind: 'buffer', type: 'read-only-storage' },
            ],
        });
        if (this.collidersLayout === null) this.collidersLayout = this.core.create<LayoutSpec>({ kind: 'layout', discriminator: 'pbf_colliders_layout', entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, kind: 'buffer', type: 'read-only-storage' }] });

        const particlesBuf = this.resources.poolBufferSpec(this.bodyType);
        if (particlesBuf === undefined) return;

        if (this.paramsBg === null) this.paramsBg = this.core.create<BindGroupSpec>({ kind: 'bindgroup', discriminator: 'pbf_params_bg', layout: this.paramsLayout, bindings: [{ binding: 0, kind: 'buffer', buffer: this.paramsBuffer }] });
        if (this.particlesBg === null) this.particlesBg = this.core.create<BindGroupSpec>({ kind: 'bindgroup', discriminator: 'pbf_particles_bg', layout: this.particlesLayout, bindings: [{ binding: 0, kind: 'buffer', buffer: particlesBuf }] });
        const nlist = this.neighborSearch?.neighborList;
        const ncount = this.neighborSearch?.neighborCount;
        if (this.neighborsBg === null && nlist !== null && nlist !== undefined && ncount !== null && ncount !== undefined) {
            this.neighborsBg = this.core.create<BindGroupSpec>({
                kind: 'bindgroup', discriminator: 'pbf_neighbors_bg', layout: this.neighborsLayout,
                bindings: [
                    { binding: 0, kind: 'buffer', buffer: nlist },
                    { binding: 1, kind: 'buffer', buffer: ncount },
                ],
            });
        }
        if (this.collidersBg === null) this.collidersBg = this.core.create<BindGroupSpec>({ kind: 'bindgroup', discriminator: 'pbf_colliders_bg', layout: this.collidersLayout, bindings: [{ binding: 0, kind: 'buffer', buffer: this.collidersBuffer }] });

        const layoutsNoNeigh = [this.paramsLayout, this.particlesLayout];
        const layoutsWithNeigh = [this.paramsLayout, this.particlesLayout, this.neighborsLayout];
        const layoutsCollision = [this.paramsLayout, this.particlesLayout, this.collidersLayout];

        if (this.predictPipeline === null)         this.predictPipeline = this.core.create<ComputePipelineSpec>({ kind: 'pipeline', subkind: 'compute', discriminator: 'pbf_predict_pipeline', layouts: layoutsNoNeigh, shader: this.predictShader, entryPoint: 'pbf_predict_main' });
        if (this.densityLambdaPipeline === null)   this.densityLambdaPipeline = this.core.create<ComputePipelineSpec>({ kind: 'pipeline', subkind: 'compute', discriminator: 'pbf_density_lambda_pipeline', layouts: layoutsWithNeigh, shader: this.densityLambdaShader, entryPoint: 'pbf_density_lambda_main' });
        if (this.positionCorrectPipeline === null) this.positionCorrectPipeline = this.core.create<ComputePipelineSpec>({ kind: 'pipeline', subkind: 'compute', discriminator: 'pbf_position_correct_pipeline', layouts: layoutsWithNeigh, shader: this.positionCorrectShader, entryPoint: 'pbf_position_correct_main' });
        if (this.velocityUpdatePipeline === null)  this.velocityUpdatePipeline = this.core.create<ComputePipelineSpec>({ kind: 'pipeline', subkind: 'compute', discriminator: 'pbf_velocity_update_pipeline', layouts: layoutsNoNeigh, shader: this.velocityUpdateShader, entryPoint: 'pbf_velocity_update_main' });
        if (this.xsphPipeline === null)            this.xsphPipeline = this.core.create<ComputePipelineSpec>({ kind: 'pipeline', subkind: 'compute', discriminator: 'pbf_xsph_pipeline', layouts: layoutsWithNeigh, shader: this.xsphShader, entryPoint: 'pbf_xsph_main' });
        if (this.vorticityPipeline === null)       this.vorticityPipeline = this.core.create<ComputePipelineSpec>({ kind: 'pipeline', subkind: 'compute', discriminator: 'pbf_vorticity_pipeline', layouts: layoutsWithNeigh, shader: this.vorticityShader, entryPoint: 'pbf_vorticity_main' });
        if (this.collisionPipeline === null)       this.collisionPipeline = this.core.create<ComputePipelineSpec>({ kind: 'pipeline', subkind: 'compute', discriminator: 'pbf_collision_pipeline', layouts: layoutsCollision, shader: this.collisionShader, entryPoint: 'pbf_collision_main' });
    }

    private uploadParams(particleCount: number, dtSub: number): void {
        if (this.paramsBuffer === null) return;
        const accel = (this.findGravity()?.data['acceleration'] as readonly number[] | undefined) ?? [0, -9.81, 0, 0];
        const buf = new ArrayBuffer(96);
        const f32 = new Float32Array(buf);
        const u32 = new Uint32Array(buf);
        f32[0] = accel[0] ?? 0; f32[1] = accel[1] ?? -9.81; f32[2] = accel[2] ?? 0; f32[3] = dtSub;
        f32[4] = 1000; f32[5] = 0.1; f32[6] = 600; f32[7] = 0.0001;
        u32[8] = 4; f32[9] = 0.0; f32[10] = 0.05; f32[11] = this.fixedDt;
        u32[12] = particleCount; u32[13] = 0; u32[14] = this.maxNeighbors; u32[15] = 16;
        f32[16] = -10; f32[17] = -10; f32[18] = -10; f32[19] = 0.2;
        f32[20] = 0; f32[21] = 0; f32[22] = 0; f32[23] = 0;
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
        if (this.predictPipeline === null || this.densityLambdaPipeline === null || this.positionCorrectPipeline === null || this.velocityUpdatePipeline === null || this.xsphPipeline === null || this.vorticityPipeline === null || this.collisionPipeline === null) return;
        if (this.paramsBg === null || this.particlesBg === null || this.neighborsBg === null || this.collidersBg === null) return;
        const particlesBuf = this.resources.poolBufferSpec(this.bodyType);
        if (particlesBuf === undefined) return;
        const dtSub = this.fixedDt / this.substeps;
        const wgs = Math.ceil(count / 64);
        for (let s = 0; s < this.substeps; s++) {
            this.uploadParams(count, dtSub);
            this.neighborSearch?.rebuild(frame, particlesBuf, count);
            frame.compute('PBFFlow.predict', pass => {
                pass.bind.setPipeline(this.predictPipeline as ComputePipelineSpec).setBindGroup(0, this.paramsBg as BindGroupSpec).setBindGroup(1, this.particlesBg as BindGroupSpec);
                pass.dispatch.workgroups(wgs);
            });
            for (let i = 0; i < this.solverIters; i++) {
                frame.compute('PBFFlow.density_lambda', pass => {
                    pass.bind.setPipeline(this.densityLambdaPipeline as ComputePipelineSpec).setBindGroup(0, this.paramsBg as BindGroupSpec).setBindGroup(1, this.particlesBg as BindGroupSpec).setBindGroup(2, this.neighborsBg as BindGroupSpec);
                    pass.dispatch.workgroups(wgs);
                });
                frame.compute('PBFFlow.position_correct', pass => {
                    pass.bind.setPipeline(this.positionCorrectPipeline as ComputePipelineSpec).setBindGroup(0, this.paramsBg as BindGroupSpec).setBindGroup(1, this.particlesBg as BindGroupSpec).setBindGroup(2, this.neighborsBg as BindGroupSpec);
                    pass.dispatch.workgroups(wgs);
                });
            }
            frame.compute('PBFFlow.collision', pass => {
                pass.bind.setPipeline(this.collisionPipeline as ComputePipelineSpec).setBindGroup(0, this.paramsBg as BindGroupSpec).setBindGroup(1, this.particlesBg as BindGroupSpec).setBindGroup(2, this.collidersBg as BindGroupSpec);
                pass.dispatch.workgroups(wgs);
            });
            frame.compute('PBFFlow.velocity_update', pass => {
                pass.bind.setPipeline(this.velocityUpdatePipeline as ComputePipelineSpec).setBindGroup(0, this.paramsBg as BindGroupSpec).setBindGroup(1, this.particlesBg as BindGroupSpec);
                pass.dispatch.workgroups(wgs);
            });
            frame.compute('PBFFlow.vorticity', pass => {
                pass.bind.setPipeline(this.vorticityPipeline as ComputePipelineSpec).setBindGroup(0, this.paramsBg as BindGroupSpec).setBindGroup(1, this.particlesBg as BindGroupSpec).setBindGroup(2, this.neighborsBg as BindGroupSpec);
                pass.dispatch.workgroups(wgs);
            });
            frame.compute('PBFFlow.xsph', pass => {
                pass.bind.setPipeline(this.xsphPipeline as ComputePipelineSpec).setBindGroup(0, this.paramsBg as BindGroupSpec).setBindGroup(1, this.particlesBg as BindGroupSpec).setBindGroup(2, this.neighborsBg as BindGroupSpec);
                pass.dispatch.workgroups(wgs);
            });
        }
    }
}
