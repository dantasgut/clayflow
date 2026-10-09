import type { EngineCore, Frame, StorageBufferSpec } from '../../../core/contracts/index';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
import type { Phase } from '../../../scene/flows/Flow';
import {
    createComputeKernel,
    destroyComputeKernel,
    type ComputeKernel,
} from '../../../scene/flows/createComputeKernel';
import type { ResourceSystem } from '../../../scene/systems/ResourceSystem';
import type { World } from '../../../scene/world/World';
import { Time } from '../../../scene/time/Time';
import { PerStepUniforms } from './PerStepUniforms';
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
/** Bytes do struct `PBFSimParams`. */
const PBF_SIM_PARAMS_BYTE_SIZE = 96;

export interface PBFFlowOptions {
    /** Substeps por passo de física (default 1). O passo vem do `Time` da cena. */
    readonly substeps?: number;
    readonly solverIters?: number;
    readonly maxNeighbors?: number;
}

/**
 * PBFFlow — fluidos por Position Based Fluids. O quadro executa `time.steps × substeps` iterações; cada uma
 * reconstrói a vizinhança e roda predict → (densidade/λ → correção)×N → colisão → velocidade → vorticidade → XSPH
 * com a sua região de `PBFSimParams` (`dt = stepDt / substeps`, `dt_frame = stepDt`) ligada por offset dinâmico.
 */
export class PBFFlow extends Flow {
    readonly type = 'PBFFlow';
    readonly bodyType = 'PBFSchema';
    readonly phase: Phase = 'physics';

    private readonly substeps: number;
    private readonly solverIters: number;
    private readonly maxNeighbors: number;

    private readonly params: PerStepUniforms;
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
        this.substeps = Math.max(1, options.substeps ?? 1);
        this.solverIters = Math.max(1, options.solverIters ?? 4);
        this.maxNeighbors = options.maxNeighbors ?? 64;
        this.params = new PerStepUniforms(core, {
            discriminator: 'pbf_params',
            byteSize: PBF_SIM_PARAMS_BYTE_SIZE,
        });
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
            this.invalidateKernels();
            this.neighborSearch?.invalidateParticlesBinding();
        }
    }

    /** Libera e esquece os kernels (bind groups dependem de buffers que mudaram). */
    private invalidateKernels(): void {
        for (const k of [
            this.predictKernel,
            this.densityLambdaKernel,
            this.positionCorrectKernel,
            this.velocityUpdateKernel,
            this.xsphKernel,
            this.vorticityKernel,
            this.collisionKernel,
        ]) {
            if (k !== null) destroyComputeKernel(this.core, k);
        }
        this.predictKernel = null;
        this.densityLambdaKernel = null;
        this.positionCorrectKernel = null;
        this.velocityUpdateKernel = null;
        this.xsphKernel = null;
        this.vorticityKernel = null;
        this.collisionKernel = null;
    }

    private ensureGpuObjects(): void {
        const b = this.base();
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
        this.neighborSearch.allocate();
        const nlist = this.neighborSearch.neighborList;
        const ncount = this.neighborSearch.neighborCount;
        if (nlist === null || ncount === null) return;

        const paramsGroup = {
            bindings: [this.params.binding(0)],
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

    /** Preenche a região `region` de `PBFSimParams` com o `dt` da iteração e do passo. */
    private fillParams(
        region: number,
        particleCount: number,
        dtSub: number,
        stepDt: number,
        accel: readonly number[],
    ): void {
        const f32 = this.params.f32(region);
        const u32 = this.params.u32(region);
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
        f32[11] = stepDt;
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
        const time = this.world.findResource(Time.schema, Time);
        const steps = time?.steps ?? 0;
        if (time === undefined || steps === 0) return;
        const count = this.resources.poolCount(this.bodyType);
        if (count === 0) return;
        const iterations = steps * this.substeps;
        if (this.params.reserve(iterations)) this.invalidateKernels();
        const accel = (this.findGravity()?.data.acceleration as readonly number[] | undefined) ?? [
            0, -9.81, 0, 0,
        ];
        for (let i = 0; i < iterations; i++) {
            this.fillParams(i, count, time.stepDt / this.substeps, time.stepDt, accel);
        }
        this.params.flush(iterations);

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
        const wgs = Math.ceil(count / 64);
        const run = (label: string, k: ComputeKernel, offset: number[]): void => {
            frame.compute(label, (pass) => {
                pass.bind.setPipeline(k.pipeline);
                // Grupo 0 = parâmetros (offset dinâmico da iteração); demais grupos sem offset.
                k.bindGroups.forEach((bg, g) => {
                    pass.bind.setBindGroup(g, bg, g === 0 ? offset : undefined);
                });
                pass.dispatch.workgroups(wgs);
            });
        };
        for (let i = 0; i < iterations; i++) {
            const offset = [this.params.offset(i)];
            // A vizinhança acompanha cada iteração (as posições mudam entre elas).
            this.neighborSearch?.rebuild(frame, particlesBuf, count);
            run('PBFFlow.predict', predict, offset);
            for (let it = 0; it < this.solverIters; it++) {
                run('PBFFlow.density_lambda', densityLambda, offset);
                run('PBFFlow.position_correct', positionCorrect, offset);
            }
            run('PBFFlow.collision', collision, offset);
            run('PBFFlow.velocity_update', velocityUpdate, offset);
            run('PBFFlow.vorticity', vorticity, offset);
            run('PBFFlow.xsph', xsph, offset);
        }
    }
}
