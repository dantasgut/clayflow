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
    readonly bodyType = 'PBFParticle:PBF';
    readonly phase: Phase = 'physics';

    private readonly fixedDt: number;
    private readonly substeps: number;
    private readonly solverIters: number;
    private readonly maxNeighbors: number;

    private paramsBuffer: UniformBufferSpec | null = null;
    private neighborSearch: NeighborSearchPipeline | null = null;
    private collidersBuffer: StorageBufferSpec | null = null;
    private predictKernel: ComputeKernel | null = null;
    private densityLambdaKernel: ComputeKernel | null = null;
    private positionCorrectKernel: ComputeKernel | null = null;
    private velocityUpdateKernel: ComputeKernel | null = null;
    private xsphKernel: ComputeKernel | null = null;
    private vorticityKernel: ComputeKernel | null = null;
    private collisionKernel: ComputeKernel | null = null;

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
        return [pbfSimParamsStruct, pbfParticleStruct, colliderDescStruct, sphKernelsLib].join(
            '\n',
        );
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        const b = this.base();
        return [
            {
                id: 'pipeline_pbf_predict',
                role: 'compute',
                shaderSource: b + '\n' + pbfPredictKernel,
                entryPoints: ['pbf_predict_main'],
                consumes: [this.bodyType, 'GravityField'],
            },
            {
                id: 'pipeline_pbf_density_lambda',
                role: 'compute',
                shaderSource: b + '\n' + pbfDensityLambdaKernel,
                entryPoints: ['pbf_density_lambda_main'],
                consumes: [this.bodyType],
            },
            {
                id: 'pipeline_pbf_position_correct',
                role: 'compute',
                shaderSource: b + '\n' + pbfPositionCorrectKernel,
                entryPoints: ['pbf_position_correct_main'],
                consumes: [this.bodyType],
            },
            {
                id: 'pipeline_pbf_velocity_update',
                role: 'compute',
                shaderSource: b + '\n' + pbfVelocityUpdateKernel,
                entryPoints: ['pbf_velocity_update_main'],
                consumes: [this.bodyType],
            },
            {
                id: 'pipeline_pbf_xsph',
                role: 'compute',
                shaderSource: b + '\n' + pbfXsphKernel,
                entryPoints: ['pbf_xsph_main'],
                consumes: [this.bodyType],
            },
            {
                id: 'pipeline_pbf_vorticity',
                role: 'compute',
                shaderSource: b + '\n' + pbfVorticityKernel,
                entryPoints: ['pbf_vorticity_main'],
                consumes: [this.bodyType],
            },
            {
                id: 'pipeline_pbf_collision',
                role: 'compute',
                shaderSource: b + '\n' + pbfCollisionKernel,
                entryPoints: ['pbf_collision_main'],
                consumes: [this.bodyType],
            },
        ];
    }

    override isReady(): boolean {
        return this.resources.poolCount(this.bodyType) > 0;
    }

    override onPoolReallocated(poolKey: string): void {
        if (poolKey === this.bodyType) {
            this.predictKernel = null;
            this.densityLambdaKernel = null;
            this.positionCorrectKernel = null;
            this.velocityUpdateKernel = null;
            this.xsphKernel = null;
            this.vorticityKernel = null;
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
                discriminator: 'pbf_params',
                byteSize: 96,
            });
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
        if (this.collidersBuffer === null)
            this.collidersBuffer = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: 'pbf_colliders',
                byteSize: COLLIDER_DESC_SIZE,
            });

        const particlesBuf = this.resources.poolBufferSpec(this.bodyType);
        if (particlesBuf === undefined) return;
        const nlist = this.neighborSearch.neighborList;
        const ncount = this.neighborSearch.neighborCount;
        if (nlist === null || ncount === null) return;

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

        if (this.predictKernel === null) {
            this.predictKernel = createComputeKernel(this.core, {
                discriminator: 'pbf_predict',
                shaderSource: b + '\n' + pbfPredictKernel,
                entryPoint: 'pbf_predict_main',
                bindGroups: [paramsGroup, particlesGroup],
            });
        }
        if (this.densityLambdaKernel === null) {
            this.densityLambdaKernel = createComputeKernel(this.core, {
                discriminator: 'pbf_density_lambda',
                shaderSource: b + '\n' + pbfDensityLambdaKernel,
                entryPoint: 'pbf_density_lambda_main',
                bindGroups: [paramsGroup, particlesGroup, neighborsGroup],
            });
        }
        if (this.positionCorrectKernel === null) {
            this.positionCorrectKernel = createComputeKernel(this.core, {
                discriminator: 'pbf_position_correct',
                shaderSource: b + '\n' + pbfPositionCorrectKernel,
                entryPoint: 'pbf_position_correct_main',
                bindGroups: [paramsGroup, particlesGroup, neighborsGroup],
            });
        }
        if (this.velocityUpdateKernel === null) {
            this.velocityUpdateKernel = createComputeKernel(this.core, {
                discriminator: 'pbf_velocity_update',
                shaderSource: b + '\n' + pbfVelocityUpdateKernel,
                entryPoint: 'pbf_velocity_update_main',
                bindGroups: [paramsGroup, particlesGroup],
            });
        }
        if (this.xsphKernel === null) {
            this.xsphKernel = createComputeKernel(this.core, {
                discriminator: 'pbf_xsph',
                shaderSource: b + '\n' + pbfXsphKernel,
                entryPoint: 'pbf_xsph_main',
                bindGroups: [paramsGroup, particlesGroup, neighborsGroup],
            });
        }
        if (this.vorticityKernel === null) {
            this.vorticityKernel = createComputeKernel(this.core, {
                discriminator: 'pbf_vorticity',
                shaderSource: b + '\n' + pbfVorticityKernel,
                entryPoint: 'pbf_vorticity_main',
                bindGroups: [paramsGroup, particlesGroup, neighborsGroup],
            });
        }
        if (this.collisionKernel === null) {
            this.collisionKernel = createComputeKernel(this.core, {
                discriminator: 'pbf_collision',
                shaderSource: b + '\n' + pbfCollisionKernel,
                entryPoint: 'pbf_collision_main',
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
        f32[6] = 600;
        f32[7] = 0.0001;
        u32[8] = 4;
        f32[9] = 0.0;
        f32[10] = 0.05;
        f32[11] = this.fixedDt;
        u32[12] = particleCount;
        u32[13] = 0;
        u32[14] = this.maxNeighbors;
        u32[15] = 16;
        f32[16] = -10;
        f32[17] = -10;
        f32[18] = -10;
        f32[19] = 0.2;
        f32[20] = 0;
        f32[21] = 0;
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
        const predict = this.predictKernel;
        const densityLambda = this.densityLambdaKernel;
        const positionCorrect = this.positionCorrectKernel;
        const velocityUpdate = this.velocityUpdateKernel;
        const xsph = this.xsphKernel;
        const vorticity = this.vorticityKernel;
        const collision = this.collisionKernel;
        if (
            predict === null
            || densityLambda === null
            || positionCorrect === null
            || velocityUpdate === null
            || xsph === null
            || vorticity === null
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
            dispatchKernel('PBFFlow.predict', predict);
            for (let i = 0; i < this.solverIters; i++) {
                dispatchKernel('PBFFlow.density_lambda', densityLambda);
                dispatchKernel('PBFFlow.position_correct', positionCorrect);
            }
            dispatchKernel('PBFFlow.collision', collision);
            dispatchKernel('PBFFlow.velocity_update', velocityUpdate);
            dispatchKernel('PBFFlow.vorticity', vorticity);
            dispatchKernel('PBFFlow.xsph', xsph);
        }
    }
}
