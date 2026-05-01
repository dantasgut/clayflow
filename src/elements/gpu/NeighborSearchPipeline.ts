import type {
    BindGroupSpec,
    ComputePipelineSpec,
    EngineCore,
    Frame,
    LayoutSpec,
    ShaderModuleSpec,
    StorageBufferSpec,
    UniformBufferSpec,
} from '../../core/contracts/index';
import nsSimParamsStruct from './wgsl/structs/ns_sim_params.wgsl?raw';
import nsAssignCount from './wgsl/kernels/ns_assign_count.wgsl?raw';
import nsScanLocal from './wgsl/kernels/ns_scan_local.wgsl?raw';
import nsScanGroups from './wgsl/kernels/ns_scan_groups.wgsl?raw';
import nsScanCombine from './wgsl/kernels/ns_scan_combine.wgsl?raw';
import nsScatter from './wgsl/kernels/ns_scatter.wgsl?raw';
import nsFind from './wgsl/kernels/ns_find.wgsl?raw';

export interface NeighborSearchOptions {
    readonly gridDim?: readonly [number, number, number];
    readonly cellSize?: number;
    readonly origin?: readonly [number, number, number];
    readonly maxParticles: number;
    readonly maxNeighbors: number;
    readonly particleStrideF32: number;
    readonly discriminator: string;
}

export class NeighborSearchPipeline {
    private readonly disc: string;
    private readonly gridDim: readonly [number, number, number];
    private readonly cellSize: number;
    private readonly origin: readonly [number, number, number];
    private readonly maxParticles: number;
    private readonly maxNeighbors: number;
    private readonly particleStrideF32: number;
    private readonly cellCount: number;

    private paramsBuffer: UniformBufferSpec | null = null;
    private cellCountBuffer: StorageBufferSpec | null = null;
    private cellStartBuffer: StorageBufferSpec | null = null;
    private cellCursorBuffer: StorageBufferSpec | null = null;
    private cellIdsBuffer: StorageBufferSpec | null = null;
    private groupSumsBuffer: StorageBufferSpec | null = null;
    private sortedParticlesBuffer: StorageBufferSpec | null = null;
    private neighborListBuffer: StorageBufferSpec | null = null;
    private neighborCountBuffer: StorageBufferSpec | null = null;

    private paramsLayout: LayoutSpec | null = null;
    private assignLayout: LayoutSpec | null = null;
    private cellCountLayout: LayoutSpec | null = null;
    private scanLocalLayout: LayoutSpec | null = null;
    private scanGroupsLayout: LayoutSpec | null = null;
    private scanCombineLayout: LayoutSpec | null = null;
    private scatterLayout: LayoutSpec | null = null;
    private findLayout: LayoutSpec | null = null;

    private paramsBg: BindGroupSpec | null = null;
    private assignBg: BindGroupSpec | null = null;
    private cellCountBg: BindGroupSpec | null = null;
    private scanLocalBg: BindGroupSpec | null = null;
    private scanGroupsBg: BindGroupSpec | null = null;
    private scanCombineBg: BindGroupSpec | null = null;
    private scatterBg: BindGroupSpec | null = null;
    private findBg: BindGroupSpec | null = null;

    private assignShader: ShaderModuleSpec | null = null;
    private scanLocalShader: ShaderModuleSpec | null = null;
    private scanGroupsShader: ShaderModuleSpec | null = null;
    private scanCombineShader: ShaderModuleSpec | null = null;
    private scatterShader: ShaderModuleSpec | null = null;
    private findShader: ShaderModuleSpec | null = null;

    private assignPipeline: ComputePipelineSpec | null = null;
    private scanLocalPipeline: ComputePipelineSpec | null = null;
    private scanGroupsPipeline: ComputePipelineSpec | null = null;
    private scanCombinePipeline: ComputePipelineSpec | null = null;
    private scatterPipeline: ComputePipelineSpec | null = null;
    private findPipeline: ComputePipelineSpec | null = null;

    private currentParticleCount = 0;
    private currentParticlesBuffer: StorageBufferSpec | null = null;

    constructor(
        private readonly core: EngineCore,
        options: NeighborSearchOptions,
    ) {
        this.disc = options.discriminator;
        this.gridDim = options.gridDim ?? [32, 32, 32];
        this.cellSize = options.cellSize ?? 0.1;
        this.origin = options.origin ?? [-1.6, -1.6, -1.6];
        this.maxParticles = options.maxParticles;
        this.maxNeighbors = options.maxNeighbors;
        this.particleStrideF32 = options.particleStrideF32;
        this.cellCount = this.gridDim[0] * this.gridDim[1] * this.gridDim[2];
    }

    private base(): string {
        return nsSimParamsStruct;
    }

    /**
     * Invalida bind groups que dependem do particles buffer atual.
     * Chamado por SPHFlow/PBFFlow quando o pool de partículas reallocate.
     */
    invalidateParticlesBinding(): void {
        this.assignBg = null;
        this.findBg = null;
        this.currentParticlesBuffer = null;
    }

    private ensureBuffersAndLayouts(): void {
        if (this.paramsBuffer === null) {
            this.paramsBuffer = this.core.create<UniformBufferSpec>({
                kind: 'buffer',
                subkind: 'uniform',
                discriminator: `ns_params:${this.disc}`,
                byteSize: 48,
            });
        }
        if (this.cellCountBuffer === null) {
            this.cellCountBuffer = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `ns_cell_count:${this.disc}`,
                byteSize: this.cellCount * 4,
            });
        }
        if (this.cellStartBuffer === null) {
            this.cellStartBuffer = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `ns_cell_start:${this.disc}`,
                byteSize: this.cellCount * 4,
            });
        }
        if (this.cellCursorBuffer === null) {
            this.cellCursorBuffer = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `ns_cell_cursor:${this.disc}`,
                byteSize: this.cellCount * 4,
            });
        }
        if (this.cellIdsBuffer === null) {
            this.cellIdsBuffer = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `ns_cell_ids:${this.disc}`,
                byteSize: this.maxParticles * 4,
            });
        }
        if (this.groupSumsBuffer === null) {
            const groups = Math.ceil(this.cellCount / 256);
            this.groupSumsBuffer = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `ns_group_sums:${this.disc}`,
                byteSize: Math.max(256, groups) * 4,
            });
        }
        if (this.sortedParticlesBuffer === null) {
            this.sortedParticlesBuffer = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `ns_sorted:${this.disc}`,
                byteSize: this.maxParticles * 4,
            });
        }
        if (this.neighborListBuffer === null) {
            this.neighborListBuffer = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `ns_nlist:${this.disc}`,
                byteSize: this.maxParticles * this.maxNeighbors * 4,
            });
        }
        if (this.neighborCountBuffer === null) {
            this.neighborCountBuffer = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `ns_ncount:${this.disc}`,
                byteSize: this.maxParticles * 4,
            });
        }
        if (this.paramsLayout === null) {
            this.paramsLayout = this.core.create<LayoutSpec>({
                kind: 'layout',
                discriminator: 'ns_params_layout',
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        kind: 'buffer',
                        type: 'uniform',
                    },
                ],
            });
        }
        if (this.assignLayout === null) {
            this.assignLayout = this.core.create<LayoutSpec>({
                kind: 'layout',
                discriminator: 'ns_assign_layout',
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        kind: 'buffer',
                        type: 'read-only-storage',
                    },
                    {
                        binding: 1,
                        visibility: GPUShaderStage.COMPUTE,
                        kind: 'buffer',
                        type: 'storage',
                    },
                ],
            });
        }
        if (this.cellCountLayout === null) {
            this.cellCountLayout = this.core.create<LayoutSpec>({
                kind: 'layout',
                discriminator: 'ns_cellcount_layout',
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        kind: 'buffer',
                        type: 'storage',
                    },
                ],
            });
        }
        if (this.scanLocalLayout === null) {
            this.scanLocalLayout = this.core.create<LayoutSpec>({
                kind: 'layout',
                discriminator: 'ns_scan_local_layout',
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        kind: 'buffer',
                        type: 'read-only-storage',
                    },
                    {
                        binding: 1,
                        visibility: GPUShaderStage.COMPUTE,
                        kind: 'buffer',
                        type: 'storage',
                    },
                    {
                        binding: 2,
                        visibility: GPUShaderStage.COMPUTE,
                        kind: 'buffer',
                        type: 'storage',
                    },
                ],
            });
        }
        if (this.scanGroupsLayout === null) {
            this.scanGroupsLayout = this.core.create<LayoutSpec>({
                kind: 'layout',
                discriminator: 'ns_scan_groups_layout',
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        kind: 'buffer',
                        type: 'storage',
                    },
                ],
            });
        }
        if (this.scanCombineLayout === null) {
            this.scanCombineLayout = this.core.create<LayoutSpec>({
                kind: 'layout',
                discriminator: 'ns_scan_combine_layout',
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        kind: 'buffer',
                        type: 'storage',
                    },
                    {
                        binding: 1,
                        visibility: GPUShaderStage.COMPUTE,
                        kind: 'buffer',
                        type: 'read-only-storage',
                    },
                ],
            });
        }
        if (this.scatterLayout === null) {
            this.scatterLayout = this.core.create<LayoutSpec>({
                kind: 'layout',
                discriminator: 'ns_scatter_layout',
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        kind: 'buffer',
                        type: 'read-only-storage',
                    },
                    {
                        binding: 1,
                        visibility: GPUShaderStage.COMPUTE,
                        kind: 'buffer',
                        type: 'storage',
                    },
                    {
                        binding: 2,
                        visibility: GPUShaderStage.COMPUTE,
                        kind: 'buffer',
                        type: 'storage',
                    },
                ],
            });
        }
        if (this.findLayout === null) {
            this.findLayout = this.core.create<LayoutSpec>({
                kind: 'layout',
                discriminator: 'ns_find_layout',
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        kind: 'buffer',
                        type: 'read-only-storage',
                    },
                    {
                        binding: 1,
                        visibility: GPUShaderStage.COMPUTE,
                        kind: 'buffer',
                        type: 'read-only-storage',
                    },
                    {
                        binding: 2,
                        visibility: GPUShaderStage.COMPUTE,
                        kind: 'buffer',
                        type: 'read-only-storage',
                    },
                    {
                        binding: 3,
                        visibility: GPUShaderStage.COMPUTE,
                        kind: 'buffer',
                        type: 'read-only-storage',
                    },
                    {
                        binding: 4,
                        visibility: GPUShaderStage.COMPUTE,
                        kind: 'buffer',
                        type: 'storage',
                    },
                    {
                        binding: 5,
                        visibility: GPUShaderStage.COMPUTE,
                        kind: 'buffer',
                        type: 'storage',
                    },
                ],
            });
        }
    }

    private ensureBindGroups(particlesBuffer: StorageBufferSpec): void {
        if (this.paramsLayout === null || this.paramsBuffer === null) return;
        if (
            this.cellCountBuffer === null
            || this.cellStartBuffer === null
            || this.cellCursorBuffer === null
            || this.cellIdsBuffer === null
            || this.groupSumsBuffer === null
            || this.sortedParticlesBuffer === null
            || this.neighborListBuffer === null
            || this.neighborCountBuffer === null
        )
            return;

        if (this.currentParticlesBuffer !== particlesBuffer) {
            this.assignBg = null;
            this.findBg = null;
            this.currentParticlesBuffer = particlesBuffer;
        }

        if (this.paramsBg === null) {
            this.paramsBg = this.core.create<BindGroupSpec>({
                kind: 'bindgroup',
                discriminator: `ns_params_bg:${this.disc}`,
                layout: this.paramsLayout,
                bindings: [{ binding: 0, kind: 'buffer', buffer: this.paramsBuffer }],
            });
        }
        if (this.assignBg === null && this.assignLayout !== null) {
            this.assignBg = this.core.create<BindGroupSpec>({
                kind: 'bindgroup',
                discriminator: `ns_assign_bg:${this.disc}`,
                layout: this.assignLayout,
                bindings: [
                    { binding: 0, kind: 'buffer', buffer: particlesBuffer },
                    { binding: 1, kind: 'buffer', buffer: this.cellIdsBuffer },
                ],
            });
        }
        if (this.cellCountBg === null && this.cellCountLayout !== null) {
            this.cellCountBg = this.core.create<BindGroupSpec>({
                kind: 'bindgroup',
                discriminator: `ns_cellcount_bg:${this.disc}`,
                layout: this.cellCountLayout,
                bindings: [{ binding: 0, kind: 'buffer', buffer: this.cellCountBuffer }],
            });
        }
        if (this.scanLocalBg === null && this.scanLocalLayout !== null) {
            this.scanLocalBg = this.core.create<BindGroupSpec>({
                kind: 'bindgroup',
                discriminator: `ns_scan_local_bg:${this.disc}`,
                layout: this.scanLocalLayout,
                bindings: [
                    { binding: 0, kind: 'buffer', buffer: this.cellCountBuffer },
                    { binding: 1, kind: 'buffer', buffer: this.cellStartBuffer },
                    { binding: 2, kind: 'buffer', buffer: this.groupSumsBuffer },
                ],
            });
        }
        if (this.scanGroupsBg === null && this.scanGroupsLayout !== null) {
            this.scanGroupsBg = this.core.create<BindGroupSpec>({
                kind: 'bindgroup',
                discriminator: `ns_scan_groups_bg:${this.disc}`,
                layout: this.scanGroupsLayout,
                bindings: [{ binding: 0, kind: 'buffer', buffer: this.groupSumsBuffer }],
            });
        }
        if (this.scanCombineBg === null && this.scanCombineLayout !== null) {
            this.scanCombineBg = this.core.create<BindGroupSpec>({
                kind: 'bindgroup',
                discriminator: `ns_scan_combine_bg:${this.disc}`,
                layout: this.scanCombineLayout,
                bindings: [
                    { binding: 0, kind: 'buffer', buffer: this.cellStartBuffer },
                    { binding: 1, kind: 'buffer', buffer: this.groupSumsBuffer },
                ],
            });
        }
        if (this.scatterBg === null && this.scatterLayout !== null) {
            this.scatterBg = this.core.create<BindGroupSpec>({
                kind: 'bindgroup',
                discriminator: `ns_scatter_bg:${this.disc}`,
                layout: this.scatterLayout,
                bindings: [
                    { binding: 0, kind: 'buffer', buffer: this.cellIdsBuffer },
                    { binding: 1, kind: 'buffer', buffer: this.cellCursorBuffer },
                    { binding: 2, kind: 'buffer', buffer: this.sortedParticlesBuffer },
                ],
            });
        }
        if (this.findBg === null && this.findLayout !== null) {
            this.findBg = this.core.create<BindGroupSpec>({
                kind: 'bindgroup',
                discriminator: `ns_find_bg:${this.disc}`,
                layout: this.findLayout,
                bindings: [
                    { binding: 0, kind: 'buffer', buffer: particlesBuffer },
                    { binding: 1, kind: 'buffer', buffer: this.cellStartBuffer },
                    { binding: 2, kind: 'buffer', buffer: this.cellCountBuffer },
                    { binding: 3, kind: 'buffer', buffer: this.sortedParticlesBuffer },
                    { binding: 4, kind: 'buffer', buffer: this.neighborListBuffer },
                    { binding: 5, kind: 'buffer', buffer: this.neighborCountBuffer },
                ],
            });
        }
    }

    private ensurePipelines(): void {
        const b = this.base();
        if (this.assignShader === null)
            this.assignShader = this.core.create<ShaderModuleSpec>({
                kind: 'shader',
                discriminator: 'ns_assign_count',
                source: b + '\n' + nsAssignCount,
            });
        if (this.scanLocalShader === null)
            this.scanLocalShader = this.core.create<ShaderModuleSpec>({
                kind: 'shader',
                discriminator: 'ns_scan_local',
                source: b + '\n' + nsScanLocal,
            });
        if (this.scanGroupsShader === null)
            this.scanGroupsShader = this.core.create<ShaderModuleSpec>({
                kind: 'shader',
                discriminator: 'ns_scan_groups',
                source: b + '\n' + nsScanGroups,
            });
        if (this.scanCombineShader === null)
            this.scanCombineShader = this.core.create<ShaderModuleSpec>({
                kind: 'shader',
                discriminator: 'ns_scan_combine',
                source: b + '\n' + nsScanCombine,
            });
        if (this.scatterShader === null)
            this.scatterShader = this.core.create<ShaderModuleSpec>({
                kind: 'shader',
                discriminator: 'ns_scatter',
                source: b + '\n' + nsScatter,
            });
        if (this.findShader === null)
            this.findShader = this.core.create<ShaderModuleSpec>({
                kind: 'shader',
                discriminator: 'ns_find',
                source: b + '\n' + nsFind,
            });

        if (
            this.paramsLayout === null
            || this.assignLayout === null
            || this.cellCountLayout === null
            || this.scanLocalLayout === null
            || this.scanGroupsLayout === null
            || this.scanCombineLayout === null
            || this.scatterLayout === null
            || this.findLayout === null
        )
            return;

        if (this.assignPipeline === null)
            this.assignPipeline = this.core.create<ComputePipelineSpec>({
                kind: 'pipeline',
                subkind: 'compute',
                discriminator: `ns_assign_pipe:${this.disc}`,
                layouts: [this.paramsLayout, this.assignLayout, this.cellCountLayout],
                shader: this.assignShader,
                entryPoint: 'ns_assign_count_main',
            });
        if (this.scanLocalPipeline === null)
            this.scanLocalPipeline = this.core.create<ComputePipelineSpec>({
                kind: 'pipeline',
                subkind: 'compute',
                discriminator: `ns_scan_local_pipe:${this.disc}`,
                layouts: [this.paramsLayout, this.scanLocalLayout],
                shader: this.scanLocalShader,
                entryPoint: 'ns_scan_local_main',
            });
        if (this.scanGroupsPipeline === null)
            this.scanGroupsPipeline = this.core.create<ComputePipelineSpec>({
                kind: 'pipeline',
                subkind: 'compute',
                discriminator: `ns_scan_groups_pipe:${this.disc}`,
                layouts: [this.paramsLayout, this.scanGroupsLayout],
                shader: this.scanGroupsShader,
                entryPoint: 'ns_scan_groups_main',
            });
        if (this.scanCombinePipeline === null)
            this.scanCombinePipeline = this.core.create<ComputePipelineSpec>({
                kind: 'pipeline',
                subkind: 'compute',
                discriminator: `ns_scan_combine_pipe:${this.disc}`,
                layouts: [this.paramsLayout, this.scanCombineLayout],
                shader: this.scanCombineShader,
                entryPoint: 'ns_scan_combine_main',
            });
        if (this.scatterPipeline === null)
            this.scatterPipeline = this.core.create<ComputePipelineSpec>({
                kind: 'pipeline',
                subkind: 'compute',
                discriminator: `ns_scatter_pipe:${this.disc}`,
                layouts: [this.paramsLayout, this.scatterLayout],
                shader: this.scatterShader,
                entryPoint: 'ns_scatter_main',
            });
        if (this.findPipeline === null)
            this.findPipeline = this.core.create<ComputePipelineSpec>({
                kind: 'pipeline',
                subkind: 'compute',
                discriminator: `ns_find_pipe:${this.disc}`,
                layouts: [this.paramsLayout, this.findLayout],
                shader: this.findShader,
                entryPoint: 'ns_find_main',
            });
    }

    private uploadParams(particleCount: number): void {
        if (this.paramsBuffer === null) return;
        const buf = new ArrayBuffer(48);
        const f32 = new Float32Array(buf);
        const u32 = new Uint32Array(buf);
        f32[0] = this.origin[0];
        f32[1] = this.origin[1];
        f32[2] = this.origin[2];
        f32[3] = this.cellSize;
        u32[4] = this.gridDim[0];
        u32[5] = this.gridDim[1];
        u32[6] = this.gridDim[2];
        u32[7] = this.cellCount;
        u32[8] = particleCount;
        u32[9] = this.particleStrideF32;
        u32[10] = this.maxNeighbors;
        u32[11] = 0;
        this.core.write(this.paramsBuffer, new Uint8Array(buf));
    }

    get neighborList(): StorageBufferSpec | null {
        return this.neighborListBuffer;
    }

    get neighborCount(): StorageBufferSpec | null {
        return this.neighborCountBuffer;
    }

    private clearBuffer(buf: StorageBufferSpec, byteSize: number): void {
        const arr = new Uint8Array(byteSize);
        this.core.write(buf, arr);
    }

    rebuild(frame: Frame, particlesBuffer: StorageBufferSpec, particleCount: number): void {
        if (particleCount === 0) return;
        this.ensureBuffersAndLayouts();
        this.ensureBindGroups(particlesBuffer);
        this.ensurePipelines();
        if (
            this.assignPipeline === null
            || this.scanLocalPipeline === null
            || this.scanGroupsPipeline === null
            || this.scanCombinePipeline === null
            || this.scatterPipeline === null
            || this.findPipeline === null
        )
            return;
        if (
            this.paramsBg === null
            || this.assignBg === null
            || this.cellCountBg === null
            || this.scanLocalBg === null
            || this.scanGroupsBg === null
            || this.scanCombineBg === null
            || this.scatterBg === null
            || this.findBg === null
        )
            return;

        this.uploadParams(particleCount);
        this.clearBuffer(this.cellCountBuffer!, this.cellCount * 4);
        this.clearBuffer(this.neighborCountBuffer!, particleCount * 4);
        this.currentParticleCount = particleCount;

        const partWg = Math.ceil(particleCount / 64);
        const cellWg = Math.ceil(this.cellCount / 256);

        frame.compute('NS.assign_count', (pass) => {
            pass.bind
                .setPipeline(this.assignPipeline!)
                .setBindGroup(0, this.paramsBg!)
                .setBindGroup(1, this.assignBg!)
                .setBindGroup(2, this.cellCountBg!);
            pass.dispatch.workgroups(partWg);
        });
        frame.compute('NS.scan_local', (pass) => {
            pass.bind
                .setPipeline(this.scanLocalPipeline!)
                .setBindGroup(0, this.paramsBg!)
                .setBindGroup(1, this.scanLocalBg!);
            pass.dispatch.workgroups(cellWg);
        });
        frame.compute('NS.scan_groups', (pass) => {
            pass.bind
                .setPipeline(this.scanGroupsPipeline!)
                .setBindGroup(0, this.paramsBg!)
                .setBindGroup(1, this.scanGroupsBg!);
            pass.dispatch.workgroups(1);
        });
        frame.compute('NS.scan_combine', (pass) => {
            pass.bind
                .setPipeline(this.scanCombinePipeline!)
                .setBindGroup(0, this.paramsBg!)
                .setBindGroup(1, this.scanCombineBg!);
            pass.dispatch.workgroups(cellWg);
        });
        // cell_cursor recebe cópia de cell_start: scatter usa atomicAdd em
        // cell_cursor para alocar o slot dentro do range [start, start+count).
        frame.copy(this.cellStartBuffer!, this.cellCursorBuffer!, this.cellCount * 4);
        frame.compute('NS.scatter', (pass) => {
            pass.bind
                .setPipeline(this.scatterPipeline!)
                .setBindGroup(0, this.paramsBg!)
                .setBindGroup(1, this.scatterBg!);
            pass.dispatch.workgroups(partWg);
        });
        frame.compute('NS.find', (pass) => {
            pass.bind
                .setPipeline(this.findPipeline!)
                .setBindGroup(0, this.paramsBg!)
                .setBindGroup(1, this.findBg!);
            pass.dispatch.workgroups(partWg);
        });
        void this.currentParticleCount;
    }
}
