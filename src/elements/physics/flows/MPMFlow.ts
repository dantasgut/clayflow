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
import mpmSimParamsStruct from '../../gpu/wgsl/structs/mpm_sim_params.wgsl?raw';
import mpmParticleStruct from '../../gpu/wgsl/structs/mpm_particle.wgsl?raw';
import mpmGridNodeStruct from '../../gpu/wgsl/structs/mpm_grid_node.wgsl?raw';
import colliderDescStruct from '../../gpu/wgsl/structs/collider_desc.wgsl?raw';
import matLib from '../../gpu/wgsl/math/mat.wgsl?raw';
import mpmWeightsLib from '../../gpu/wgsl/math/mpm_weights.wgsl?raw';
import mpmP2GKernel from '../../gpu/wgsl/kernels/mpm_p2g.wgsl?raw';
import mpmGridUpdateKernel from '../../gpu/wgsl/kernels/mpm_grid_update.wgsl?raw';
import mpmG2PKernel from '../../gpu/wgsl/kernels/mpm_g2p.wgsl?raw';
import mpmClearGridKernel from '../../gpu/wgsl/kernels/mpm_clear_grid.wgsl?raw';

const COLLIDER_DESC_SIZE = 160;
const MPM_GRID_NODE_SIZE = 32;

export interface MPMFlowOptions {
    readonly bodyType?: 'FluidBody:MPM' | 'SoftBody:MPM';
    readonly fixedDt?: number;
    readonly substeps?: number;
    readonly gridDim?: readonly [number, number, number];
    readonly cellSize?: number;
    readonly gridOrigin?: readonly [number, number, number];
}

export class MPMFlow extends Flow {
    readonly type = 'MPMFlow';
    readonly bodyType: string;
    readonly phase: Phase = 'physics';

    private readonly fixedDt: number;
    private readonly substeps: number;
    private readonly gridDim: readonly [number, number, number];
    private readonly cellSize: number;
    private readonly gridOrigin: readonly [number, number, number];

    private p2gShader: ShaderModuleSpec | null = null;
    private gridUpdateShader: ShaderModuleSpec | null = null;
    private g2pShader: ShaderModuleSpec | null = null;
    private clearGridShader: ShaderModuleSpec | null = null;
    private clearGridPipeline: ComputePipelineSpec | null = null;
    private paramsBuffer: UniformBufferSpec | null = null;
    private gridBuffer: StorageBufferSpec | null = null;
    private collidersBuffer: StorageBufferSpec | null = null;
    private paramsLayout: LayoutSpec | null = null;
    private gridLayout: LayoutSpec | null = null;
    private particlesLayout: LayoutSpec | null = null;
    private collidersLayout: LayoutSpec | null = null;
    private paramsBg: BindGroupSpec | null = null;
    private gridBg: BindGroupSpec | null = null;
    private particlesBg: BindGroupSpec | null = null;
    private collidersBg: BindGroupSpec | null = null;
    private p2gPipeline: ComputePipelineSpec | null = null;
    private gridUpdatePipeline: ComputePipelineSpec | null = null;
    private g2pPipeline: ComputePipelineSpec | null = null;

    constructor(
        private readonly core: EngineCore,
        private readonly world: World,
        private readonly resources: ResourceSystem,
        options: MPMFlowOptions = {},
    ) {
        super();
        this.bodyType = options.bodyType ?? 'FluidBody:MPM';
        this.fixedDt = options.fixedDt ?? 1 / 60;
        this.substeps = Math.max(1, options.substeps ?? 1);
        this.gridDim = options.gridDim ?? [32, 32, 32];
        this.cellSize = options.cellSize ?? 0.1;
        this.gridOrigin = options.gridOrigin ?? [-1.6, -1.6, -1.6];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        const baseSrc = [mpmSimParamsStruct, mpmParticleStruct, mpmGridNodeStruct, colliderDescStruct, matLib, mpmWeightsLib].join('\n');
        return [
            { id: 'pipeline_mpm_p2g', role: 'compute', shaderSource: baseSrc + '\n' + mpmP2GKernel, entryPoints: ['mpm_p2g_main'], consumes: [this.bodyType, 'GravityField'] },
            { id: 'pipeline_mpm_grid_update', role: 'compute', shaderSource: baseSrc + '\n' + mpmGridUpdateKernel, entryPoints: ['mpm_grid_update_main'], consumes: [this.bodyType, 'GravityField'] },
            { id: 'pipeline_mpm_g2p', role: 'compute', shaderSource: baseSrc + '\n' + mpmG2PKernel, entryPoints: ['mpm_g2p_main'], consumes: [this.bodyType, 'GravityField'] },
        ];
    }

    override isReady(): boolean {
        return this.resources.poolCount(this.bodyType) > 0;
    }

    private gridCellCount(): number {
        return this.gridDim[0] * this.gridDim[1] * this.gridDim[2];
    }

    private ensureGpuObjects(): void {
        const baseSrc = [mpmSimParamsStruct, mpmParticleStruct, mpmGridNodeStruct, colliderDescStruct, matLib, mpmWeightsLib].join('\n');
        if (this.p2gShader === null) {
            this.p2gShader = this.core.create<ShaderModuleSpec>({ kind: 'shader', discriminator: 'mpm_p2g_shader', source: baseSrc + '\n' + mpmP2GKernel });
        }
        if (this.gridUpdateShader === null) {
            this.gridUpdateShader = this.core.create<ShaderModuleSpec>({ kind: 'shader', discriminator: 'mpm_grid_update_shader', source: baseSrc + '\n' + mpmGridUpdateKernel });
        }
        if (this.g2pShader === null) {
            this.g2pShader = this.core.create<ShaderModuleSpec>({ kind: 'shader', discriminator: 'mpm_g2p_shader', source: baseSrc + '\n' + mpmG2PKernel });
        }
        if (this.clearGridShader === null) {
            this.clearGridShader = this.core.create<ShaderModuleSpec>({ kind: 'shader', discriminator: 'mpm_clear_grid_shader', source: baseSrc + '\n' + mpmClearGridKernel });
        }
        if (this.paramsBuffer === null) {
            this.paramsBuffer = this.core.create<UniformBufferSpec>({ kind: 'buffer', subkind: 'uniform', discriminator: 'mpm_params', byteSize: 96 });
        }
        if (this.gridBuffer === null) {
            this.gridBuffer = this.core.create<StorageBufferSpec>({ kind: 'buffer', subkind: 'storage', discriminator: 'mpm_grid', byteSize: this.gridCellCount() * MPM_GRID_NODE_SIZE });
        }
        if (this.collidersBuffer === null) {
            this.collidersBuffer = this.core.create<StorageBufferSpec>({ kind: 'buffer', subkind: 'storage', discriminator: 'mpm_colliders', byteSize: COLLIDER_DESC_SIZE });
        }
        if (this.paramsLayout === null) {
            this.paramsLayout = this.core.create<LayoutSpec>({
                kind: 'layout', discriminator: 'mpm_params_layout',
                entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, kind: 'buffer', type: 'uniform' }],
            });
        }
        if (this.gridLayout === null) {
            this.gridLayout = this.core.create<LayoutSpec>({
                kind: 'layout', discriminator: 'mpm_grid_layout',
                entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, kind: 'buffer', type: 'storage' }],
            });
        }
        if (this.particlesLayout === null) {
            this.particlesLayout = this.core.create<LayoutSpec>({
                kind: 'layout', discriminator: 'mpm_particles_layout',
                entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, kind: 'buffer', type: 'storage' }],
            });
        }
        if (this.collidersLayout === null) {
            this.collidersLayout = this.core.create<LayoutSpec>({
                kind: 'layout', discriminator: 'mpm_colliders_layout',
                entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, kind: 'buffer', type: 'read-only-storage' }],
            });
        }
        const particlesBuf = this.resources.poolBufferSpec(this.bodyType);
        if (particlesBuf === undefined) return;
        if (this.paramsBg === null) {
            this.paramsBg = this.core.create<BindGroupSpec>({ kind: 'bindgroup', discriminator: 'mpm_params_bg', layout: this.paramsLayout, bindings: [{ binding: 0, kind: 'buffer', buffer: this.paramsBuffer }] });
        }
        if (this.gridBg === null) {
            this.gridBg = this.core.create<BindGroupSpec>({ kind: 'bindgroup', discriminator: 'mpm_grid_bg', layout: this.gridLayout, bindings: [{ binding: 0, kind: 'buffer', buffer: this.gridBuffer }] });
        }
        if (this.particlesBg === null) {
            this.particlesBg = this.core.create<BindGroupSpec>({ kind: 'bindgroup', discriminator: 'mpm_particles_bg', layout: this.particlesLayout, bindings: [{ binding: 0, kind: 'buffer', buffer: particlesBuf }] });
        }
        if (this.collidersBg === null) {
            this.collidersBg = this.core.create<BindGroupSpec>({ kind: 'bindgroup', discriminator: 'mpm_colliders_bg', layout: this.collidersLayout, bindings: [{ binding: 0, kind: 'buffer', buffer: this.collidersBuffer }] });
        }
        if (this.p2gPipeline === null) {
            this.p2gPipeline = this.core.create<ComputePipelineSpec>({ kind: 'pipeline', subkind: 'compute', discriminator: 'mpm_p2g_pipeline', layouts: [this.paramsLayout, this.gridLayout, this.particlesLayout], shader: this.p2gShader, entryPoint: 'mpm_p2g_main' });
        }
        if (this.gridUpdatePipeline === null) {
            this.gridUpdatePipeline = this.core.create<ComputePipelineSpec>({ kind: 'pipeline', subkind: 'compute', discriminator: 'mpm_grid_update_pipeline', layouts: [this.paramsLayout, this.gridLayout, this.particlesLayout, this.collidersLayout], shader: this.gridUpdateShader, entryPoint: 'mpm_grid_update_main' });
        }
        if (this.g2pPipeline === null) {
            this.g2pPipeline = this.core.create<ComputePipelineSpec>({ kind: 'pipeline', subkind: 'compute', discriminator: 'mpm_g2p_pipeline', layouts: [this.paramsLayout, this.gridLayout, this.particlesLayout], shader: this.g2pShader, entryPoint: 'mpm_g2p_main' });
        }
        if (this.clearGridPipeline === null && this.clearGridShader !== null) {
            this.clearGridPipeline = this.core.create<ComputePipelineSpec>({ kind: 'pipeline', subkind: 'compute', discriminator: 'mpm_clear_grid_pipeline', layouts: [this.paramsLayout, this.gridLayout], shader: this.clearGridShader, entryPoint: 'mpm_clear_grid_main' });
        }
    }

    private uploadParams(particleCount: number, dtSub: number): void {
        if (this.paramsBuffer === null) return;
        const accel = (this.findGravity()?.data['acceleration'] as readonly number[] | undefined) ?? [0, -9.81, 0, 0];
        const buf = new ArrayBuffer(96);
        const f32 = new Float32Array(buf);
        const u32 = new Uint32Array(buf);
        f32[0] = accel[0] ?? 0;
        f32[1] = accel[1] ?? -9.81;
        f32[2] = accel[2] ?? 0;
        f32[3] = dtSub;
        f32[4] = 1e3; f32[5] = 1e3; f32[6] = 1e7; f32[7] = 0;
        f32[8] = 0; f32[9] = 0; f32[10] = 0;
        f32[11] = this.fixedDt;
        u32[12] = particleCount;
        u32[13] = this.gridDim[0]; u32[14] = this.gridDim[1]; u32[15] = this.gridDim[2];
        f32[16] = this.gridOrigin[0]; f32[17] = this.gridOrigin[1]; f32[18] = this.gridOrigin[2];
        f32[19] = this.cellSize;
        u32[20] = 0; u32[21] = 0; u32[22] = this.substeps;
        f32[23] = 1.0 / this.cellSize;
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
        if (this.p2gPipeline === null || this.gridUpdatePipeline === null || this.g2pPipeline === null) return;
        if (this.paramsBg === null || this.gridBg === null || this.particlesBg === null || this.collidersBg === null) return;
        const dtSub = this.fixedDt / this.substeps;
        const particleWg = Math.ceil(count / 64);
        const gridWg = Math.ceil(this.gridCellCount() / 64);
        for (let s = 0; s < this.substeps; s++) {
            this.uploadParams(count, dtSub);
            if (this.clearGridPipeline !== null) {
                frame.compute('MPMFlow.clear_grid', pass => {
                    pass.bind
                        .setPipeline(this.clearGridPipeline as ComputePipelineSpec)
                        .setBindGroup(0, this.paramsBg as BindGroupSpec)
                        .setBindGroup(1, this.gridBg as BindGroupSpec);
                    pass.dispatch.workgroups(gridWg);
                });
            }
            frame.compute('MPMFlow.p2g', pass => {
                pass.bind
                    .setPipeline(this.p2gPipeline as ComputePipelineSpec)
                    .setBindGroup(0, this.paramsBg as BindGroupSpec)
                    .setBindGroup(1, this.gridBg as BindGroupSpec)
                    .setBindGroup(2, this.particlesBg as BindGroupSpec);
                pass.dispatch.workgroups(particleWg);
            });
            frame.compute('MPMFlow.grid_update', pass => {
                pass.bind
                    .setPipeline(this.gridUpdatePipeline as ComputePipelineSpec)
                    .setBindGroup(0, this.paramsBg as BindGroupSpec)
                    .setBindGroup(1, this.gridBg as BindGroupSpec)
                    .setBindGroup(2, this.particlesBg as BindGroupSpec)
                    .setBindGroup(3, this.collidersBg as BindGroupSpec);
                pass.dispatch.workgroups(gridWg);
            });
            frame.compute('MPMFlow.g2p', pass => {
                pass.bind
                    .setPipeline(this.g2pPipeline as ComputePipelineSpec)
                    .setBindGroup(0, this.paramsBg as BindGroupSpec)
                    .setBindGroup(1, this.gridBg as BindGroupSpec)
                    .setBindGroup(2, this.particlesBg as BindGroupSpec);
                pass.dispatch.workgroups(particleWg);
            });
        }
    }
}
