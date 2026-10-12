import type { EngineCore, Frame } from '../../../core/contracts/index';
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
import { SPHSimParamsSchema } from '../schemas/simParams';
import { ColliderSet } from '../colliders/ColliderSet';
import { ParticleMaterial, TAIT_GAMMA } from '../materials/ParticleMaterial';
import { GravityField } from '../forcefields/GravityField';
import { NeighborSearchPipeline } from '../../gpu/NeighborSearchPipeline';
import { sphCollision, sphDensity, sphForces, sphIntegrate, sphPressure } from '../shaders/sph';

/** Bytes do struct `SPHSimParams`. */
/** Coeficiente do XSPH (suavização de velocidade). */
const SPH_XSPH = 0.05;

export interface SPHFlowOptions {
    /** Mínimo de substeps por passo (default 1); o passo estável do `ParticleMaterial` pode exigir mais. */
    readonly substeps?: number;
    /** Vizinhos guardados por partícula (default 128; o suporte 2h tem ~73 vizinhos em repouso). */
    readonly maxNeighbors?: number;
}

/**
 * SPHFlow — fluidos por Smoothed Particle Hydrodynamics fracamente compressível (Tait). O quadro executa
 * `time.steps × substeps` iterações, com `substeps` pelo passo estável do `ParticleMaterial` (CFL 0,4 h/c); cada
 * uma reconstrói a vizinhança (raio = suporte 2h) e roda densidade → pressão → forças → integração → colisão com a
 * sua região de `SPHSimParams` (`dt = stepDt / substeps`, `dt_frame = stepDt`) ligada por offset dinâmico. Massa,
 * suavização, rigidez, viscosidade, restituição e domínio vêm do material.
 */
export class SPHFlow extends Flow {
    readonly type = 'SPHFlow';
    readonly bodyType = 'SPHSchema';
    readonly phase: Phase = 'physics';

    private readonly substeps: number;
    private readonly maxNeighbors: number;

    private readonly params: PerStepUniforms;
    private neighborSearch: NeighborSearchPipeline | null = null;
    /** Grade com que a vizinhança foi criada (recriada quando o material muda). */
    private neighborKey = '';
    /** Pools de collider e mapas de dono (grupo 2 do kernel de colisão). */
    private readonly colliders: ColliderSet;
    /** `colliders.generation` com que os kernels foram criados. */
    private collidersGeneration = -1;
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
        this.substeps = Math.max(1, options.substeps ?? 1);
        this.maxNeighbors = options.maxNeighbors ?? 128;
        this.params = new PerStepUniforms(core, {
            discriminator: 'sph_params',
            schema: SPHSimParamsSchema,
        });
        this.colliders = new ColliderSet(core, world, resources, {
            discriminator: 'sph_colliders',
        });
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [
            {
                id: 'pipeline_sph_density',
                role: 'compute',
                shader: sphDensity,
                entryPoints: ['sph_density_main'],
                consumes: [this.bodyType],
            },
            {
                id: 'pipeline_sph_pressure',
                role: 'compute',
                shader: sphPressure,
                entryPoints: ['sph_pressure_main'],
                consumes: [this.bodyType],
            },
            {
                id: 'pipeline_sph_forces',
                role: 'compute',
                shader: sphForces,
                entryPoints: ['sph_forces_main'],
                consumes: [this.bodyType],
            },
            {
                id: 'pipeline_sph_integrate',
                role: 'compute',
                shader: sphIntegrate,
                entryPoints: ['sph_integrate_main'],
                consumes: [this.bodyType, 'GravityField'],
            },
            {
                id: 'pipeline_sph_collision',
                role: 'compute',
                shader: sphCollision,
                entryPoints: ['sph_collision_main'],
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
            this.densityKernel,
            this.pressureKernel,
            this.forcesKernel,
            this.integrateKernel,
            this.collisionKernel,
        ]) {
            if (k !== null) destroyComputeKernel(this.core, k);
        }
        this.densityKernel = null;
        this.pressureKernel = null;
        this.forcesKernel = null;
        this.integrateKernel = null;
        this.collisionKernel = null;
    }

    private ensureGpuObjects(): void {
        if (this.neighborSearch === null) return;

        const particlesBuf = this.resources.poolBufferSpec(this.bodyType);
        if (particlesBuf === undefined) return;
        this.neighborSearch.allocate();
        const nlist = this.neighborSearch.neighborList;
        const ncount = this.neighborSearch.neighborCount;
        if (nlist === null || ncount === null) return;

        // Bindgroups por slot. Cada kernel cria sua própria cópia (specHash
        // dedup mantém GPU layout único quando estrutura é idêntica).
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

        if (this.densityKernel === null) {
            this.densityKernel = createComputeKernel(this.core, {
                discriminator: 'sph_density',
                shader: sphDensity,
                entryPoint: 'sph_density_main',
                bindGroups: [paramsGroup, particlesGroup, neighborsGroup],
            });
        }
        if (this.pressureKernel === null) {
            this.pressureKernel = createComputeKernel(this.core, {
                discriminator: 'sph_pressure',
                shader: sphPressure,
                entryPoint: 'sph_pressure_main',
                bindGroups: [paramsGroup, particlesGroup],
            });
        }
        if (this.forcesKernel === null) {
            this.forcesKernel = createComputeKernel(this.core, {
                discriminator: 'sph_forces',
                shader: sphForces,
                entryPoint: 'sph_forces_main',
                bindGroups: [paramsGroup, particlesGroup, neighborsGroup],
            });
        }
        if (this.integrateKernel === null) {
            this.integrateKernel = createComputeKernel(this.core, {
                discriminator: 'sph_integrate',
                shader: sphIntegrate,
                entryPoint: 'sph_integrate_main',
                bindGroups: [paramsGroup, particlesGroup],
            });
        }
        if (this.collisionKernel === null) {
            this.collisionKernel = createComputeKernel(this.core, {
                discriminator: 'sph_collision',
                shader: sphCollision,
                entryPoint: 'sph_collision_main',
                bindGroups: [paramsGroup, particlesGroup, collidersGroup],
            });
        }
    }

    /** Vizinhança com raio = suporte do núcleo (2h) e grade pelo domínio; recriada quando o material muda. */
    private ensureNeighborSearch(material: ParticleMaterial): void {
        const grid = material.gridFor(2 * material.sphSmoothingLength);
        const key = `${grid.cellSize}|${grid.gridDim.join(',')}|${grid.origin.join(',')}`;
        if (this.neighborSearch !== null && key === this.neighborKey) return;
        this.neighborSearch?.dispose();
        this.invalidateKernels();
        this.neighborSearch = new NeighborSearchPipeline(this.core, {
            discriminator: 'sph',
            maxParticles: 65536,
            maxNeighbors: this.maxNeighbors,
            particleStrideF32: 16,
            cellSize: grid.cellSize,
            gridDim: grid.gridDim,
            origin: grid.origin,
        });
        this.neighborKey = key;
    }

    /** Preenche a região `region` de `SPHSimParams` com o `dt` da iteração e do passo e os derivados do material. */
    private fillParams(
        region: number,
        particleCount: number,
        dtSub: number,
        stepDt: number,
        accel: readonly number[],
        material: ParticleMaterial,
    ): void {
        this.params.write(region, {
            gravity: [accel[0] ?? 0, accel[1] ?? -9.81, accel[2] ?? 0],
            dt: dtSub,
            rest_density: material.restDensity,
            h: material.sphSmoothingLength,
            stiffness: material.taitStiffness,
            gamma: TAIT_GAMMA,
            viscosity: material.viscosity,
            xsph_c: SPH_XSPH,
            dt_frame: stepDt,
            collision_radius: material.particleSpacing / 2,
            particle_count: particleCount,
            max_neighbors: this.maxNeighbors,
            restitution: material.restitution,
            bound_min: material.domainMin,
            particle_mass: material.particleMass,
            inv_particle_mass: 1 / material.particleMass,
        });
    }

    dispatch(frame: Frame): void {
        const time = this.world.findResource(Time.schema, Time);
        const steps = time?.steps ?? 0;
        if (time === undefined || steps === 0) return;
        const count = this.resources.poolCount(this.bodyType);
        if (count === 0) return;
        const material = ParticleMaterial.of(this.world);
        const substeps = ParticleMaterial.substepsFor(
            time.stepDt,
            material.sphStableDt,
            this.substeps,
        );
        const iterations = steps * substeps;
        if (this.params.reserve(iterations)) this.invalidateKernels();
        const accel = (this.world.findResource(GravityField.schema, GravityField)?.data
            .acceleration as readonly number[] | undefined) ?? [0, -9.81, 0, 0];
        for (let i = 0; i < iterations; i++) {
            this.fillParams(i, count, time.stepDt / substeps, time.stepDt, accel, material);
        }
        this.ensureNeighborSearch(material);
        this.params.flush(iterations);

        this.colliders.refresh();
        if (this.colliders.generation !== this.collidersGeneration) {
            this.invalidateKernels();
            this.collidersGeneration = this.colliders.generation;
        }
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
            run('SPHFlow.density', density, offset);
            run('SPHFlow.pressure', pressure, offset);
            run('SPHFlow.forces', forces, offset);
            run('SPHFlow.integrate', integrate, offset);
            run('SPHFlow.collision', collision, offset);
        }
    }
}
