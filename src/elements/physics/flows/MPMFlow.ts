import type {
    EngineCore,
    Frame,
    StorageBufferSpec,
    UniformBufferSpec,
} from '../../../core/contracts/index';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
import type { Phase } from '../../../scene/flows/Flow';
import { createComputeKernel, type ComputeKernel } from '../../../scene/flows/createComputeKernel';
import type { ResourceSystem } from '../../../scene/systems/ResourceSystem';
import type { World } from '../../../scene/world/World';
import type { GravityField } from '../forcefields/GravityField';
import mpmSimParamsStruct from '../../gpu/wgsl/structs/mpm_sim_params.wgsl?raw';
import mpmParticleStruct from '../../gpu/wgsl/structs/mpm_particle.wgsl?raw';
import mpmGridNodeStruct from '../../gpu/wgsl/structs/mpm_grid_node.wgsl?raw';
import colliderDescStruct from '../../gpu/wgsl/structs/collider_desc.wgsl?raw';
import matLib from '../../gpu/wgsl/math/mat.wgsl?raw';
import sdfLib from '../../gpu/wgsl/math/sdf.wgsl?raw';
import mpmWeightsLib from '../../gpu/wgsl/math/mpm_weights.wgsl?raw';
import mpmP2GKernel from '../../gpu/wgsl/kernels/mpm_p2g.wgsl?raw';
import mpmGridUpdateKernel from '../../gpu/wgsl/kernels/mpm_grid_update.wgsl?raw';
import mpmG2PKernel from '../../gpu/wgsl/kernels/mpm_g2p.wgsl?raw';
import mpmClearGridKernel from '../../gpu/wgsl/kernels/mpm_clear_grid.wgsl?raw';

const COLLIDER_DESC_SIZE = 160;
const MPM_GRID_NODE_SIZE = 32;

export interface MPMFlowOptions {
    readonly bodyType?: string;
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

    private paramsBuffer: UniformBufferSpec | null = null;
    private gridBuffer: StorageBufferSpec | null = null;
    private collidersBuffer: StorageBufferSpec | null = null;
    private clearGridKernel: ComputeKernel | null = null;
    private p2gKernel: ComputeKernel | null = null;
    private gridUpdateKernel: ComputeKernel | null = null;
    private g2pKernel: ComputeKernel | null = null;

    constructor(
        private readonly core: EngineCore,
        private readonly world: World,
        private readonly resources: ResourceSystem,
        options: MPMFlowOptions = {},
    ) {
        super();
        this.bodyType = options.bodyType ?? 'MPMFluidSchema';
        this.fixedDt = options.fixedDt ?? 1 / 60;
        this.substeps = Math.max(1, options.substeps ?? 1);
        this.gridDim = options.gridDim ?? [32, 32, 32];
        this.cellSize = options.cellSize ?? 0.1;
        this.gridOrigin = options.gridOrigin ?? [-1.6, -1.6, -1.6];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        const baseSrc = [
            mpmSimParamsStruct,
            mpmParticleStruct,
            mpmGridNodeStruct,
            colliderDescStruct,
            matLib,
            sdfLib,
            mpmWeightsLib,
        ].join('\n');
        return [
            {
                id: 'pipeline_mpm_p2g',
                role: 'compute',
                shaderSource: baseSrc + '\n' + mpmP2GKernel,
                entryPoints: ['mpm_p2g_main'],
                consumes: [this.bodyType, 'GravityField'],
            },
            {
                id: 'pipeline_mpm_grid_update',
                role: 'compute',
                shaderSource: baseSrc + '\n' + mpmGridUpdateKernel,
                entryPoints: ['mpm_grid_update_main'],
                consumes: [this.bodyType, 'GravityField'],
            },
            {
                id: 'pipeline_mpm_g2p',
                role: 'compute',
                shaderSource: baseSrc + '\n' + mpmG2PKernel,
                entryPoints: ['mpm_g2p_main'],
                consumes: [this.bodyType, 'GravityField'],
            },
        ];
    }

    override isReady(): boolean {
        return this.resources.poolCount(this.bodyType) > 0;
    }

    override onPoolReallocated(poolKey: string): void {
        if (poolKey === this.bodyType) {
            // Pool buffer mudou — invalida kernels que referenciam o particles buffer.
            this.p2gKernel = null;
            this.gridUpdateKernel = null;
            this.g2pKernel = null;
        }
    }

    private gridCellCount(): number {
        return this.gridDim[0] * this.gridDim[1] * this.gridDim[2];
    }

    private ensureGpuObjects(): void {
        const baseSrc = [
            mpmSimParamsStruct,
            mpmParticleStruct,
            mpmGridNodeStruct,
            colliderDescStruct,
            matLib,
            sdfLib,
            mpmWeightsLib,
        ].join('\n');
        if (this.paramsBuffer === null) {
            this.paramsBuffer = this.core.create<UniformBufferSpec>({
                kind: 'buffer',
                subkind: 'uniform',
                discriminator: 'mpm_params',
                byteSize: 96,
            });
        }
        if (this.gridBuffer === null) {
            this.gridBuffer = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: 'mpm_grid',
                byteSize: this.gridCellCount() * MPM_GRID_NODE_SIZE,
            });
        }
        if (this.collidersBuffer === null) {
            this.collidersBuffer = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: 'mpm_colliders',
                byteSize: COLLIDER_DESC_SIZE,
            });
        }
        const particlesBuf = this.resources.poolBufferSpec(this.bodyType);
        if (particlesBuf === undefined) return;

        // Bindgroups por slot (compartilhados conceitualmente entre os 4 kernels;
        // cada kernel cria sua própria cópia via discriminator único).
        const paramsGroup = {
            bindings: [{ binding: 0, type: 'uniform' as const, buffer: this.paramsBuffer }],
        };
        const gridGroup = {
            bindings: [{ binding: 0, type: 'storage' as const, buffer: this.gridBuffer }],
        };
        const particlesGroup = {
            bindings: [{ binding: 0, type: 'storage' as const, buffer: particlesBuf }],
        };
        const collidersGroup = {
            bindings: [
                { binding: 0, type: 'read-only-storage' as const, buffer: this.collidersBuffer },
            ],
        };

        if (this.clearGridKernel === null) {
            this.clearGridKernel = createComputeKernel(this.core, {
                discriminator: 'mpm_clear_grid',
                shaderSource: baseSrc + '\n' + mpmClearGridKernel,
                entryPoint: 'mpm_clear_grid_main',
                bindGroups: [paramsGroup, gridGroup],
            });
        }
        if (this.p2gKernel === null) {
            this.p2gKernel = createComputeKernel(this.core, {
                discriminator: 'mpm_p2g',
                shaderSource: baseSrc + '\n' + mpmP2GKernel,
                entryPoint: 'mpm_p2g_main',
                bindGroups: [paramsGroup, gridGroup, particlesGroup],
            });
        }
        if (this.gridUpdateKernel === null) {
            this.gridUpdateKernel = createComputeKernel(this.core, {
                discriminator: 'mpm_grid_update',
                shaderSource: baseSrc + '\n' + mpmGridUpdateKernel,
                entryPoint: 'mpm_grid_update_main',
                bindGroups: [paramsGroup, gridGroup, particlesGroup, collidersGroup],
            });
        }
        if (this.g2pKernel === null) {
            this.g2pKernel = createComputeKernel(this.core, {
                discriminator: 'mpm_g2p',
                shaderSource: baseSrc + '\n' + mpmG2PKernel,
                entryPoint: 'mpm_g2p_main',
                bindGroups: [paramsGroup, gridGroup, particlesGroup],
            });
        }
    }

    private uploadParams(particleCount: number, dtSub: number): void {
        if (this.paramsBuffer === null) return;
        const accel = (this.findGravity()?.data.acceleration as readonly number[] | undefined) ?? [
            0, -9.81, 0, 0,
        ];
        const buf = new ArrayBuffer(96);
        const f32 = new Float32Array(buf);
        const u32 = new Uint32Array(buf);
        f32[0] = accel[0] ?? 0;
        f32[1] = accel[1] ?? -9.81;
        f32[2] = accel[2] ?? 0;
        f32[3] = dtSub;
        f32[4] = 1e3;
        f32[5] = 1e3;
        f32[6] = 1e7;
        f32[7] = 0;
        f32[8] = 0;
        f32[9] = 0;
        f32[10] = 0;
        f32[11] = this.fixedDt;
        u32[12] = particleCount;
        u32[13] = this.gridDim[0];
        u32[14] = this.gridDim[1];
        u32[15] = this.gridDim[2];
        f32[16] = this.gridOrigin[0];
        f32[17] = this.gridOrigin[1];
        f32[18] = this.gridOrigin[2];
        f32[19] = this.cellSize;
        u32[20] = 0;
        u32[21] = 0;
        u32[22] = this.substeps;
        f32[23] = 1.0 / this.cellSize;
        this.core.write(this.paramsBuffer, new Uint8Array(buf));
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
        const count = this.resources.poolCount(this.bodyType);
        if (count === 0) return;
        this.ensureGpuObjects();
        const clear = this.clearGridKernel;
        const p2g = this.p2gKernel;
        const gridUpdate = this.gridUpdateKernel;
        const g2p = this.g2pKernel;
        if (clear === null || p2g === null || gridUpdate === null || g2p === null) return;

        const dtSub = this.fixedDt / this.substeps;
        const particleWg = Math.ceil(count / 64);
        const gridWg = Math.ceil(this.gridCellCount() / 64);
        for (let s = 0; s < this.substeps; s++) {
            this.uploadParams(count, dtSub);
            frame.compute('MPMFlow.clear_grid', (pass) => {
                pass.bind.setPipeline(clear.pipeline);
                clear.bindGroups.forEach((bg, i) => {
                    pass.bind.setBindGroup(i, bg);
                });
                pass.dispatch.workgroups(gridWg);
            });
            frame.compute('MPMFlow.p2g', (pass) => {
                pass.bind.setPipeline(p2g.pipeline);
                p2g.bindGroups.forEach((bg, i) => {
                    pass.bind.setBindGroup(i, bg);
                });
                pass.dispatch.workgroups(particleWg);
            });
            frame.compute('MPMFlow.grid_update', (pass) => {
                pass.bind.setPipeline(gridUpdate.pipeline);
                gridUpdate.bindGroups.forEach((bg, i) => {
                    pass.bind.setBindGroup(i, bg);
                });
                pass.dispatch.workgroups(gridWg);
            });
            frame.compute('MPMFlow.g2p', (pass) => {
                pass.bind.setPipeline(g2p.pipeline);
                g2p.bindGroups.forEach((bg, i) => {
                    pass.bind.setBindGroup(i, bg);
                });
                pass.dispatch.workgroups(particleWg);
            });
        }
    }
}
