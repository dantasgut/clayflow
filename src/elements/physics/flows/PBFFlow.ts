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
import { PBFSimParamsSchema } from '../schemas/simParams';
import { ColliderSet } from '../colliders/ColliderSet';
import { ParticleMaterial } from '../materials/ParticleMaterial';
import { GravityField } from '../forcefields/GravityField';
import { NeighborSearchPipeline } from '../../gpu/NeighborSearchPipeline';
import {
    pbfApply,
    pbfCollision,
    pbfDensityLambda,
    pbfPositionCorrect,
    pbfPredict,
    pbfVelocityUpdate,
    pbfVorticity,
    pbfXsph,
} from '../shaders/pbf';

/** Bytes do struct `PBFSimParams`. */
/** Expoente n do `s_corr`. */
const PBF_S_CORR_N = 4;
/** ε do confinamento de vorticidade (0 = desligado). */
const PBF_VORTICITY_EPS = 0;
/** Coeficiente do XSPH. */
const PBF_XSPH = 0.05;
/** Relaxação ε do denominador de λ (Macklin & Müller 2013), nas unidades de |∇C|² (1/m²). */
const PBF_RELAXATION = 600;
/** Coeficiente do `s_corr` para espaçamento de 0,05 m; escala com s² (mesma unidade de λ). */
const PBF_S_CORR_K_AT_5CM = 1e-4;
/** Capacidade de partículas (igual à da busca de vizinhança). */
const PBF_MAX_PARTICLES = 65536;

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
    /** Grade com que a vizinhança foi criada (recriada quando o material muda). */
    private neighborKey = '';
    /** Pools de collider e mapas de dono (grupo 2 do kernel de colisão). */
    private readonly colliders: ColliderSet;
    /** `colliders.generation` com que os kernels foram criados. */
    private collidersGeneration = -1;
    private predictKernel: ComputeKernel | null = null;
    private densityLambdaKernel: ComputeKernel | null = null;
    private positionCorrectKernel: ComputeKernel | null = null;
    private velocityUpdateKernel: ComputeKernel | null = null;
    private xsphKernel: ComputeKernel | null = null;
    private vorticityKernel: ComputeKernel | null = null;
    private collisionKernel: ComputeKernel | null = null;
    private applyPositionKernel: ComputeKernel | null = null;
    private applyVelocityKernel: ComputeKernel | null = null;
    /** Correções Δp/Δv por partícula (vec4f), separadas das posições/velocidades lidas pelos vizinhos. */
    private deltaBuffer: StorageBufferSpec | null = null;

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
            schema: PBFSimParamsSchema,
        });
        this.colliders = new ColliderSet(core, world, resources, {
            discriminator: 'pbf_colliders',
        });
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [
            {
                id: 'pipeline_pbf_predict',
                role: 'compute',
                shader: pbfPredict,
                entryPoints: ['pbf_predict_main'],
                consumes: [this.bodyType, 'GravityField'],
            },
            {
                id: 'pipeline_pbf_density_lambda',
                role: 'compute',
                shader: pbfDensityLambda,
                entryPoints: ['pbf_density_lambda_main'],
                consumes: [this.bodyType],
            },
            {
                id: 'pipeline_pbf_position_correct',
                role: 'compute',
                shader: pbfPositionCorrect,
                entryPoints: ['pbf_position_correct_main'],
                consumes: [this.bodyType],
            },
            {
                id: 'pipeline_pbf_velocity_update',
                role: 'compute',
                shader: pbfVelocityUpdate,
                entryPoints: ['pbf_velocity_update_main'],
                consumes: [this.bodyType],
            },
            {
                id: 'pipeline_pbf_xsph',
                role: 'compute',
                shader: pbfXsph,
                entryPoints: ['pbf_xsph_main'],
                consumes: [this.bodyType],
            },
            {
                id: 'pipeline_pbf_apply',
                role: 'compute',
                shader: pbfApply,
                entryPoints: ['pbf_apply_position_main', 'pbf_apply_velocity_main'],
                consumes: [this.bodyType],
            },
            {
                id: 'pipeline_pbf_vorticity',
                role: 'compute',
                shader: pbfVorticity,
                entryPoints: ['pbf_vorticity_main'],
                consumes: [this.bodyType],
            },
            {
                id: 'pipeline_pbf_collision',
                role: 'compute',
                shader: pbfCollision,
                entryPoints: ['pbf_collision_main'],
                consumes: [this.bodyType],
            },
        ];
    }

    /** Descarte do estágio: libera kernels, parâmetros, colisores e a busca de vizinhança. */
    override dispose(): void {
        this.invalidateKernels();
        this.params.dispose();
        this.colliders.destroy();
        this.neighborSearch?.dispose();
        this.neighborSearch = null;
        if (this.deltaBuffer !== null) this.core.destroy(this.deltaBuffer);
        this.deltaBuffer = null;
    }

    override onEntitiesInserted(_ids: readonly number[]): void {
        this.colliders.markDirty();
    }

    override onEntitiesRemoved(_ids: readonly number[]): void {
        this.colliders.markDirty();
    }

    override isReady(): boolean {
        return this.resources.poolCount(this.bodyType) > 0;
    }

    override onPoolReallocated(poolKey: string): void {
        this.colliders.onPoolReallocated(poolKey);
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
            this.applyPositionKernel,
            this.applyVelocityKernel,
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
        this.applyPositionKernel = null;
        this.applyVelocityKernel = null;
    }

    private ensureGpuObjects(): void {
        if (this.neighborSearch === null) return;

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
        const collidersGroup = { bindings: this.colliders.bindings() };
        this.deltaBuffer ??= this.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: 'pbf_delta',
            byteSize: PBF_MAX_PARTICLES * 16,
        });
        const deltaWriteGroup = {
            bindings: [{ binding: 0, type: 'storage' as const, buffer: this.deltaBuffer }],
        };
        const deltaReadGroup = {
            bindings: [
                { binding: 0, type: 'read-only-storage' as const, buffer: this.deltaBuffer },
            ],
        };

        if (this.predictKernel === null) {
            this.predictKernel = createComputeKernel(this.core, {
                discriminator: 'pbf_predict',
                shader: pbfPredict,
                entryPoint: 'pbf_predict_main',
                bindGroups: [paramsGroup, particlesGroup],
            });
        }
        if (this.densityLambdaKernel === null) {
            this.densityLambdaKernel = createComputeKernel(this.core, {
                discriminator: 'pbf_density_lambda',
                shader: pbfDensityLambda,
                entryPoint: 'pbf_density_lambda_main',
                bindGroups: [paramsGroup, particlesGroup, neighborsGroup],
            });
        }
        if (this.positionCorrectKernel === null) {
            this.positionCorrectKernel = createComputeKernel(this.core, {
                discriminator: 'pbf_position_correct',
                shader: pbfPositionCorrect,
                entryPoint: 'pbf_position_correct_main',
                bindGroups: [paramsGroup, particlesGroup, neighborsGroup, deltaWriteGroup],
            });
        }
        if (this.velocityUpdateKernel === null) {
            this.velocityUpdateKernel = createComputeKernel(this.core, {
                discriminator: 'pbf_velocity_update',
                shader: pbfVelocityUpdate,
                entryPoint: 'pbf_velocity_update_main',
                bindGroups: [paramsGroup, particlesGroup],
            });
        }
        if (this.xsphKernel === null) {
            this.xsphKernel = createComputeKernel(this.core, {
                discriminator: 'pbf_xsph',
                shader: pbfXsph,
                entryPoint: 'pbf_xsph_main',
                bindGroups: [paramsGroup, particlesGroup, neighborsGroup, deltaWriteGroup],
            });
        }
        if (this.applyPositionKernel === null) {
            this.applyPositionKernel = createComputeKernel(this.core, {
                discriminator: 'pbf_apply_position',
                shader: pbfApply,
                entryPoint: 'pbf_apply_position_main',
                bindGroups: [paramsGroup, particlesGroup, deltaReadGroup],
            });
        }
        if (this.applyVelocityKernel === null) {
            this.applyVelocityKernel = createComputeKernel(this.core, {
                discriminator: 'pbf_apply_velocity',
                shader: pbfApply,
                entryPoint: 'pbf_apply_velocity_main',
                bindGroups: [paramsGroup, particlesGroup, deltaReadGroup],
            });
        }
        if (this.vorticityKernel === null) {
            this.vorticityKernel = createComputeKernel(this.core, {
                discriminator: 'pbf_vorticity',
                shader: pbfVorticity,
                entryPoint: 'pbf_vorticity_main',
                bindGroups: [paramsGroup, particlesGroup, neighborsGroup],
            });
        }
        if (this.collisionKernel === null) {
            this.collisionKernel = createComputeKernel(this.core, {
                discriminator: 'pbf_collision',
                shader: pbfCollision,
                entryPoint: 'pbf_collision_main',
                bindGroups: [paramsGroup, particlesGroup, collidersGroup],
            });
        }
    }

    /** Preenche a região `region` de `PBFSimParams` com o `dt` da iteração e do passo. */
    /** Vizinhança com raio = suporte do núcleo (h) e grade pelo domínio; recriada quando o material muda. */
    private ensureNeighborSearch(material: ParticleMaterial): void {
        const grid = material.gridFor(material.pbfSmoothingLength);
        const key = `${grid.cellSize}|${grid.gridDim.join(',')}|${grid.origin.join(',')}`;
        if (this.neighborSearch !== null && key === this.neighborKey) return;
        this.neighborSearch?.dispose();
        this.invalidateKernels();
        this.neighborSearch = new NeighborSearchPipeline(this.core, {
            discriminator: 'pbf',
            maxParticles: 65536,
            maxNeighbors: this.maxNeighbors,
            particleStrideF32: 16,
            cellSize: grid.cellSize,
            gridDim: grid.gridDim,
            origin: grid.origin,
        });
        this.neighborKey = key;
    }

    private fillParams(
        region: number,
        particleCount: number,
        dtSub: number,
        stepDt: number,
        accel: readonly number[],
        material: ParticleMaterial,
    ): void {
        const spacingRatio = material.particleSpacing / 0.05;
        this.params.write(region, {
            gravity: [accel[0] ?? 0, accel[1] ?? -9.81, accel[2] ?? 0],
            dt: dtSub,
            rest_density: material.restDensity,
            h: material.pbfSmoothingLength,
            relaxation: PBF_RELAXATION,
            s_corr_k: PBF_S_CORR_K_AT_5CM * spacingRatio * spacingRatio,
            s_corr_n: PBF_S_CORR_N,
            vorticity_eps: PBF_VORTICITY_EPS,
            xsph_c: PBF_XSPH,
            dt_frame: stepDt,
            particle_count: particleCount,
            max_neighbors: this.maxNeighbors,
            restitution: material.restitution,
            collision_radius: material.particleSpacing / 2,
            bound_min: material.domainMin,
            particle_mass: material.particleMass,
            mass_over_density: material.particleMass / material.restDensity,
        });
    }

    dispatch(frame: Frame): void {
        const time = this.world.findResource(Time.schema, Time);
        const steps = time?.steps ?? 0;
        if (time === undefined || steps === 0) return;
        const count = this.resources.poolCount(this.bodyType);
        if (count === 0) return;
        const iterations = steps * this.substeps;
        if (this.params.reserve(iterations)) this.invalidateKernels();
        const accel = (this.world.findResource(GravityField.schema, GravityField)?.data
            .acceleration as readonly number[] | undefined) ?? [0, -9.81, 0, 0];
        const material = ParticleMaterial.of(this.world);
        for (let i = 0; i < iterations; i++) {
            this.fillParams(i, count, time.stepDt / this.substeps, time.stepDt, accel, material);
        }
        this.ensureNeighborSearch(material);
        this.params.flush(iterations);

        this.colliders.refresh();
        if (this.colliders.generation !== this.collidersGeneration) {
            this.invalidateKernels();
            this.collidersGeneration = this.colliders.generation;
        }
        this.ensureGpuObjects();
        const predict = this.predictKernel;
        const densityLambda = this.densityLambdaKernel;
        const positionCorrect = this.positionCorrectKernel;
        const velocityUpdate = this.velocityUpdateKernel;
        const xsph = this.xsphKernel;
        const vorticity = this.vorticityKernel;
        const collision = this.collisionKernel;
        const applyPosition = this.applyPositionKernel;
        const applyVelocity = this.applyVelocityKernel;
        if (
            predict === null
            || densityLambda === null
            || positionCorrect === null
            || velocityUpdate === null
            || xsph === null
            || vorticity === null
            || collision === null
            || applyPosition === null
            || applyVelocity === null
        )
            return;
        const particlesBuf = this.resources.poolBufferSpec(this.bodyType);
        if (particlesBuf === undefined) return;
        const run = (label: string, k: ComputeKernel, offset: number[]): void => {
            frame.compute(label, (pass) => {
                pass.bind.setPipeline(k.pipeline);
                // Grupo 0 = parâmetros (offset dinâmico da iteração); demais grupos sem offset.
                k.bindGroups.forEach((bg, g) => {
                    pass.bind.setBindGroup(g, bg, g === 0 ? offset : undefined);
                });
                pass.dispatch.invocations(count, 64);
            });
        };
        for (let i = 0; i < iterations; i++) {
            const offset = [this.params.offset(i)];
            // A vizinhança acompanha cada iteração (as posições mudam entre elas).
            this.neighborSearch?.rebuild(frame, particlesBuf, count);
            run('PBFFlow.predict', predict, offset);
            // Colisão dentro do laço do solver: cada projeção de densidade é seguida da projeção nos colliders.
            for (let it = 0; it < this.solverIters; it++) {
                run('PBFFlow.density_lambda', densityLambda, offset);
                run('PBFFlow.position_correct', positionCorrect, offset);
                run('PBFFlow.apply_position', applyPosition, offset);
                run('PBFFlow.collision', collision, offset);
            }
            run('PBFFlow.velocity_update', velocityUpdate, offset);
            run('PBFFlow.vorticity', vorticity, offset);
            run('PBFFlow.xsph', xsph, offset);
            run('PBFFlow.apply_velocity', applyVelocity, offset);
        }
    }
}
