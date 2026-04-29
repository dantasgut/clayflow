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
import sphSimParamsStruct from '../../gpu/wgsl/structs/sph_sim_params.wgsl?raw';
import sphParticleStruct from '../../gpu/wgsl/structs/sph_particle.wgsl?raw';
import colliderDescStruct from '../../gpu/wgsl/structs/collider_desc.wgsl?raw';
import sphKernelsLib from '../../gpu/wgsl/math/sph_kernels.wgsl?raw';
import sphDensityKernel from '../../gpu/wgsl/kernels/sph_density.wgsl?raw';
import sphPressureKernel from '../../gpu/wgsl/kernels/sph_pressure.wgsl?raw';
import sphForcesKernel from '../../gpu/wgsl/kernels/sph_forces.wgsl?raw';
import sphIntegrateKernel from '../../gpu/wgsl/kernels/sph_integrate.wgsl?raw';
import sphCollisionKernel from '../../gpu/wgsl/kernels/sph_collision.wgsl?raw';

const COLLIDER_DESC_SIZE = 160;

export interface SPHFlowOptions {
    readonly fixedDt?: number;
    readonly substeps?: number;
    readonly maxNeighbors?: number;
}

export class SPHFlow extends Flow {
    readonly type = 'SPHFlow';
    readonly bodyType = 'SPHParticle:SPH';
    readonly phase: Phase = 'physics';

    private readonly fixedDt: number;
    private readonly substeps: number;
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
    private densityShader: ShaderModuleSpec | null = null;
    private pressureShader: ShaderModuleSpec | null = null;
    private forcesShader: ShaderModuleSpec | null = null;
    private integrateShader: ShaderModuleSpec | null = null;
    private collisionShader: ShaderModuleSpec | null = null;
    private densityPipeline: ComputePipelineSpec | null = null;
    private pressurePipeline: ComputePipelineSpec | null = null;
    private forcesPipeline: ComputePipelineSpec | null = null;
    private integratePipeline: ComputePipelineSpec | null = null;
    private collisionPipeline: ComputePipelineSpec | null = null;

    constructor(
        private readonly core: EngineCore,
        private readonly world: World,
        private readonly resources: ResourceSystem,
        options: SPHFlowOptions = {},
    ) {
        super();
        this.fixedDt = options.fixedDt ?? 1 / 60;
        this.substeps = Math.max(1, options.substeps ?? 1);
        this.maxNeighbors = options.maxNeighbors ?? 64;
    }

    private base(): string {
        return [sphSimParamsStruct, sphParticleStruct, colliderDescStruct, sphKernelsLib].join('\n');
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        const b = this.base();
        return [
            { id: 'pipeline_sph_density', role: 'compute', shaderSource: b + '\n' + sphDensityKernel, entryPoints: ['sph_density_main'], consumes: [this.bodyType] },
            { id: 'pipeline_sph_pressure', role: 'compute', shaderSource: b + '\n' + sphPressureKernel, entryPoints: ['sph_pressure_main'], consumes: [this.bodyType] },
            { id: 'pipeline_sph_forces', role: 'compute', shaderSource: b + '\n' + sphForcesKernel, entryPoints: ['sph_forces_main'], consumes: [this.bodyType] },
            { id: 'pipeline_sph_integrate', role: 'compute', shaderSource: b + '\n' + sphIntegrateKernel, entryPoints: ['sph_integrate_main'], consumes: [this.bodyType, 'GravityField'] },
            { id: 'pipeline_sph_collision', role: 'compute', shaderSource: b + '\n' + sphCollisionKernel, entryPoints: ['sph_collision_main'], consumes: [this.bodyType] },
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
        if (this.densityShader === null)   this.densityShader = this.core.create<ShaderModuleSpec>({ kind: 'shader', discriminator: 'sph_density', source: b + '\n' + sphDensityKernel });
        if (this.pressureShader === null)  this.pressureShader = this.core.create<ShaderModuleSpec>({ kind: 'shader', discriminator: 'sph_pressure', source: b + '\n' + sphPressureKernel });
        if (this.forcesShader === null)    this.forcesShader = this.core.create<ShaderModuleSpec>({ kind: 'shader', discriminator: 'sph_forces', source: b + '\n' + sphForcesKernel });
        if (this.integrateShader === null) this.integrateShader = this.core.create<ShaderModuleSpec>({ kind: 'shader', discriminator: 'sph_integrate', source: b + '\n' + sphIntegrateKernel });
        if (this.collisionShader === null) this.collisionShader = this.core.create<ShaderModuleSpec>({ kind: 'shader', discriminator: 'sph_collision', source: b + '\n' + sphCollisionKernel });

        if (this.paramsBuffer === null) this.paramsBuffer = this.core.create<UniformBufferSpec>({ kind: 'buffer', subkind: 'uniform', discriminator: 'sph_params', byteSize: 96 });
        if (this.neighborSearch === null) {
            this.neighborSearch = new NeighborSearchPipeline(this.core, {
                discriminator: 'sph',
                maxParticles: 65536,
                maxNeighbors: this.maxNeighbors,
                particleStrideF32: 16,
                cellSize: 0.1,
                gridDim: [32, 32, 32],
                origin: [-1.6, -1.6, -1.6],
            });
        }
        if (this.collidersBuffer === null) this.collidersBuffer = this.core.create<StorageBufferSpec>({ kind: 'buffer', subkind: 'storage', discriminator: 'sph_colliders', byteSize: COLLIDER_DESC_SIZE });

        if (this.paramsLayout === null) this.paramsLayout = this.core.create<LayoutSpec>({ kind: 'layout', discriminator: 'sph_params_layout', entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, kind: 'buffer', type: 'uniform' }] });
        if (this.particlesLayout === null) this.particlesLayout = this.core.create<LayoutSpec>({ kind: 'layout', discriminator: 'sph_particles_layout', entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, kind: 'buffer', type: 'storage' }] });
        if (this.neighborsLayout === null) this.neighborsLayout = this.core.create<LayoutSpec>({
            kind: 'layout', discriminator: 'sph_neighbors_layout',
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, kind: 'buffer', type: 'read-only-storage' },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, kind: 'buffer', type: 'read-only-storage' },
            ],
        });
        if (this.collidersLayout === null) this.collidersLayout = this.core.create<LayoutSpec>({ kind: 'layout', discriminator: 'sph_colliders_layout', entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, kind: 'buffer', type: 'read-only-storage' }] });

        const particlesBuf = this.resources.poolBufferSpec(this.bodyType);
        if (particlesBuf === undefined) return;

        if (this.paramsBg === null) this.paramsBg = this.core.create<BindGroupSpec>({ kind: 'bindgroup', discriminator: 'sph_params_bg', layout: this.paramsLayout, bindings: [{ binding: 0, kind: 'buffer', buffer: this.paramsBuffer }] });
        if (this.particlesBg === null) this.particlesBg = this.core.create<BindGroupSpec>({ kind: 'bindgroup', discriminator: 'sph_particles_bg', layout: this.particlesLayout, bindings: [{ binding: 0, kind: 'buffer', buffer: particlesBuf }] });
        const nlist = this.neighborSearch?.neighborList;
        const ncount = this.neighborSearch?.neighborCount;
        if (this.neighborsBg === null && nlist !== null && nlist !== undefined && ncount !== null && ncount !== undefined) {
            this.neighborsBg = this.core.create<BindGroupSpec>({
                kind: 'bindgroup', discriminator: 'sph_neighbors_bg', layout: this.neighborsLayout,
                bindings: [
                    { binding: 0, kind: 'buffer', buffer: nlist },
                    { binding: 1, kind: 'buffer', buffer: ncount },
                ],
            });
        }
        if (this.collidersBg === null) this.collidersBg = this.core.create<BindGroupSpec>({ kind: 'bindgroup', discriminator: 'sph_colliders_bg', layout: this.collidersLayout, bindings: [{ binding: 0, kind: 'buffer', buffer: this.collidersBuffer }] });

        const layoutsNoNeigh = [this.paramsLayout, this.particlesLayout];
        const layoutsWithNeigh = [this.paramsLayout, this.particlesLayout, this.neighborsLayout];
        const layoutsCollision = [this.paramsLayout, this.particlesLayout, this.collidersLayout];

        if (this.densityPipeline === null) this.densityPipeline = this.core.create<ComputePipelineSpec>({ kind: 'pipeline', subkind: 'compute', discriminator: 'sph_density_pipeline', layouts: layoutsWithNeigh, shader: this.densityShader, entryPoint: 'sph_density_main' });
        if (this.pressurePipeline === null) this.pressurePipeline = this.core.create<ComputePipelineSpec>({ kind: 'pipeline', subkind: 'compute', discriminator: 'sph_pressure_pipeline', layouts: layoutsNoNeigh, shader: this.pressureShader, entryPoint: 'sph_pressure_main' });
        if (this.forcesPipeline === null) this.forcesPipeline = this.core.create<ComputePipelineSpec>({ kind: 'pipeline', subkind: 'compute', discriminator: 'sph_forces_pipeline', layouts: layoutsWithNeigh, shader: this.forcesShader, entryPoint: 'sph_forces_main' });
        if (this.integratePipeline === null) this.integratePipeline = this.core.create<ComputePipelineSpec>({ kind: 'pipeline', subkind: 'compute', discriminator: 'sph_integrate_pipeline', layouts: layoutsNoNeigh, shader: this.integrateShader, entryPoint: 'sph_integrate_main' });
        if (this.collisionPipeline === null) this.collisionPipeline = this.core.create<ComputePipelineSpec>({ kind: 'pipeline', subkind: 'compute', discriminator: 'sph_collision_pipeline', layouts: layoutsCollision, shader: this.collisionShader, entryPoint: 'sph_collision_main' });
    }

    private uploadParams(particleCount: number, dtSub: number): void {
        if (this.paramsBuffer === null) return;
        const accel = (this.findGravity()?.data['acceleration'] as readonly number[] | undefined) ?? [0, -9.81, 0, 0];
        const buf = new ArrayBuffer(96);
        const f32 = new Float32Array(buf);
        const u32 = new Uint32Array(buf);
        f32[0] = accel[0] ?? 0; f32[1] = accel[1] ?? -9.81; f32[2] = accel[2] ?? 0; f32[3] = dtSub;
        f32[4] = 1000; f32[5] = 0.1; f32[6] = 1000; f32[7] = 7;
        f32[8] = 0.01; f32[9] = 0.05; f32[10] = this.fixedDt; f32[11] = 0;
        u32[12] = particleCount; u32[13] = 0; u32[14] = this.maxNeighbors; u32[15] = 16;
        f32[16] = -10; f32[17] = -10; f32[18] = -10; f32[19] = 0.2;
        f32[20] = 0.02; f32[21] = 50; f32[22] = 0; f32[23] = 0;
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
        if (this.densityPipeline === null || this.pressurePipeline === null || this.forcesPipeline === null || this.integratePipeline === null || this.collisionPipeline === null) return;
        if (this.paramsBg === null || this.particlesBg === null || this.neighborsBg === null || this.collidersBg === null) return;
        const particlesBuf = this.resources.poolBufferSpec(this.bodyType);
        if (particlesBuf === undefined) return;
        const dtSub = this.fixedDt / this.substeps;
        const wgs = Math.ceil(count / 64);
        for (let s = 0; s < this.substeps; s++) {
            this.uploadParams(count, dtSub);
            this.neighborSearch?.rebuild(frame, particlesBuf, count);
            frame.compute('SPHFlow.density', pass => {
                pass.bind.setPipeline(this.densityPipeline as ComputePipelineSpec).setBindGroup(0, this.paramsBg as BindGroupSpec).setBindGroup(1, this.particlesBg as BindGroupSpec).setBindGroup(2, this.neighborsBg as BindGroupSpec);
                pass.dispatch.workgroups(wgs);
            });
            frame.compute('SPHFlow.pressure', pass => {
                pass.bind.setPipeline(this.pressurePipeline as ComputePipelineSpec).setBindGroup(0, this.paramsBg as BindGroupSpec).setBindGroup(1, this.particlesBg as BindGroupSpec);
                pass.dispatch.workgroups(wgs);
            });
            frame.compute('SPHFlow.forces', pass => {
                pass.bind.setPipeline(this.forcesPipeline as ComputePipelineSpec).setBindGroup(0, this.paramsBg as BindGroupSpec).setBindGroup(1, this.particlesBg as BindGroupSpec).setBindGroup(2, this.neighborsBg as BindGroupSpec);
                pass.dispatch.workgroups(wgs);
            });
            frame.compute('SPHFlow.integrate', pass => {
                pass.bind.setPipeline(this.integratePipeline as ComputePipelineSpec).setBindGroup(0, this.paramsBg as BindGroupSpec).setBindGroup(1, this.particlesBg as BindGroupSpec);
                pass.dispatch.workgroups(wgs);
            });
            frame.compute('SPHFlow.collision', pass => {
                pass.bind.setPipeline(this.collisionPipeline as ComputePipelineSpec).setBindGroup(0, this.paramsBg as BindGroupSpec).setBindGroup(1, this.particlesBg as BindGroupSpec).setBindGroup(2, this.collidersBg as BindGroupSpec);
                pass.dispatch.workgroups(wgs);
            });
        }
    }
}
