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
    readonly bodyType = 'SPHSchema';
    readonly phase: Phase = 'physics';

    private readonly fixedDt: number;
    private readonly substeps: number;
    private readonly maxNeighbors: number;

    private paramsBuffer: UniformBufferSpec | null = null;
    private neighborSearch: NeighborSearchPipeline | null = null;
    private collidersBuffer: StorageBufferSpec | null = null;
    private densityKernel: ComputeKernel | null = null;
    private pressureKernel: ComputeKernel | null = null;
    private forcesKernel: ComputeKernel | null = null;
    private integrateKernel: ComputeKernel | null = null;
    private collisionKernel: ComputeKernel | null = null;

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
        return [sphSimParamsStruct, sphParticleStruct, colliderDescStruct, sphKernelsLib].join(
            '\n',
        );
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        const b = this.base();
        return [
            {
                id: 'pipeline_sph_density',
                role: 'compute',
                shaderSource: b + '\n' + sphDensityKernel,
                entryPoints: ['sph_density_main'],
                consumes: [this.bodyType],
            },
            {
                id: 'pipeline_sph_pressure',
                role: 'compute',
                shaderSource: b + '\n' + sphPressureKernel,
                entryPoints: ['sph_pressure_main'],
                consumes: [this.bodyType],
            },
            {
                id: 'pipeline_sph_forces',
                role: 'compute',
                shaderSource: b + '\n' + sphForcesKernel,
                entryPoints: ['sph_forces_main'],
                consumes: [this.bodyType],
            },
            {
                id: 'pipeline_sph_integrate',
                role: 'compute',
                shaderSource: b + '\n' + sphIntegrateKernel,
                entryPoints: ['sph_integrate_main'],
                consumes: [this.bodyType, 'GravityField'],
            },
            {
                id: 'pipeline_sph_collision',
                role: 'compute',
                shaderSource: b + '\n' + sphCollisionKernel,
                entryPoints: ['sph_collision_main'],
                consumes: [this.bodyType],
            },
        ];
    }

    override isReady(): boolean {
        return this.resources.poolCount(this.bodyType) > 0;
    }

    override onPoolReallocated(poolKey: string): void {
        if (poolKey === this.bodyType) {
            this.densityKernel = null;
            this.pressureKernel = null;
            this.forcesKernel = null;
            this.integrateKernel = null;
            this.collisionKernel = null;
            this.neighborSearch?.invalidateParticlesBinding();
        }
    }

    private ensureGpuObjects(): void {
        const b = this.base();
        if (this.paramsBuffer === null)
            this.paramsBuffer = this.core.create<UniformBufferSpec>({
                kind: 'buffer',
                subkind: 'uniform',
                discriminator: 'sph_params',
                byteSize: 96,
            });
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
        if (this.collidersBuffer === null)
            this.collidersBuffer = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: 'sph_colliders',
                byteSize: COLLIDER_DESC_SIZE,
            });

        const particlesBuf = this.resources.poolBufferSpec(this.bodyType);
        if (particlesBuf === undefined) return;
        const nlist = this.neighborSearch.neighborList;
        const ncount = this.neighborSearch.neighborCount;
        if (nlist === null || ncount === null) return;

        // Bindgroups por slot. Cada kernel cria sua própria cópia (specHash
        // dedup mantém GPU layout único quando estrutura é idêntica).
        const paramsGroup = {
            bindings: [{ binding: 0, type: 'uniform' as const, buffer: this.paramsBuffer }],
        };
        const particlesGroup = {
            bindings: [{ binding: 0, type: 'storage' as const, buffer: particlesBuf }],
        };
        const neighborsGroup = {
            bindings: [
                { binding: 0, type: 'read-only-storage' as const, buffer: nlist },
                { binding: 1, type: 'read-only-storage' as const, buffer: ncount },
            ],
        };
        const collidersGroup = {
            bindings: [
                { binding: 0, type: 'read-only-storage' as const, buffer: this.collidersBuffer },
            ],
        };

        if (this.densityKernel === null) {
            this.densityKernel = createComputeKernel(this.core, {
                discriminator: 'sph_density',
                shaderSource: b + '\n' + sphDensityKernel,
                entryPoint: 'sph_density_main',
                bindGroups: [paramsGroup, particlesGroup, neighborsGroup],
            });
        }
        if (this.pressureKernel === null) {
            this.pressureKernel = createComputeKernel(this.core, {
                discriminator: 'sph_pressure',
                shaderSource: b + '\n' + sphPressureKernel,
                entryPoint: 'sph_pressure_main',
                bindGroups: [paramsGroup, particlesGroup],
            });
        }
        if (this.forcesKernel === null) {
            this.forcesKernel = createComputeKernel(this.core, {
                discriminator: 'sph_forces',
                shaderSource: b + '\n' + sphForcesKernel,
                entryPoint: 'sph_forces_main',
                bindGroups: [paramsGroup, particlesGroup, neighborsGroup],
            });
        }
        if (this.integrateKernel === null) {
            this.integrateKernel = createComputeKernel(this.core, {
                discriminator: 'sph_integrate',
                shaderSource: b + '\n' + sphIntegrateKernel,
                entryPoint: 'sph_integrate_main',
                bindGroups: [paramsGroup, particlesGroup],
            });
        }
        if (this.collisionKernel === null) {
            this.collisionKernel = createComputeKernel(this.core, {
                discriminator: 'sph_collision',
                shaderSource: b + '\n' + sphCollisionKernel,
                entryPoint: 'sph_collision_main',
                bindGroups: [paramsGroup, particlesGroup, collidersGroup],
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
        f32[4] = 1000;
        f32[5] = 0.1;
        f32[6] = 1000;
        f32[7] = 7;
        f32[8] = 0.01;
        f32[9] = 0.05;
        f32[10] = this.fixedDt;
        f32[11] = 0;
        u32[12] = particleCount;
        u32[13] = 0;
        u32[14] = this.maxNeighbors;
        u32[15] = 16;
        f32[16] = -10;
        f32[17] = -10;
        f32[18] = -10;
        f32[19] = 0.2;
        f32[20] = 0.02;
        f32[21] = 50;
        f32[22] = 0;
        f32[23] = 0;
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
        const density = this.densityKernel;
        const pressure = this.pressureKernel;
        const forces = this.forcesKernel;
        const integrate = this.integrateKernel;
        const collision = this.collisionKernel;
        if (
            density === null
            || pressure === null
            || forces === null
            || integrate === null
            || collision === null
        )
            return;
        const particlesBuf = this.resources.poolBufferSpec(this.bodyType);
        if (particlesBuf === undefined) return;
        const dtSub = this.fixedDt / this.substeps;
        const wgs = Math.ceil(count / 64);
        const dispatchKernel = (label: string, k: ComputeKernel): void => {
            frame.compute(label, (pass) => {
                pass.bind.setPipeline(k.pipeline);
                k.bindGroups.forEach((bg, i) => {
                    pass.bind.setBindGroup(i, bg);
                });
                pass.dispatch.workgroups(wgs);
            });
        };
        for (let s = 0; s < this.substeps; s++) {
            this.uploadParams(count, dtSub);
            this.neighborSearch?.rebuild(frame, particlesBuf, count);
            dispatchKernel('SPHFlow.density', density);
            dispatchKernel('SPHFlow.pressure', pressure);
            dispatchKernel('SPHFlow.forces', forces);
            dispatchKernel('SPHFlow.integrate', integrate);
            dispatchKernel('SPHFlow.collision', collision);
        }
    }
}
