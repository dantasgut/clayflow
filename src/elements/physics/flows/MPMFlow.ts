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
import { ColliderSet } from '../colliders/ColliderSet';
import { ParticleMaterial } from '../materials/ParticleMaterial';
import { GravityField } from '../forcefields/GravityField';
import { mpmClearGrid, mpmG2P, mpmGridUpdate, mpmP2G, mpmParticleCollision } from '../shaders/mpm';

const MPM_GRID_NODE_SIZE = 32;
/** Bytes do struct `MPMSimParams`. */
const MPM_SIM_PARAMS_BYTE_SIZE = 96;
/** Escala do ponto fixo das somas atômicas da grade. */
const MPM_FIXED_SCALE = 1e7;
/** `material_id` do WGSL. */
const MPM_MATERIAL_ELASTIC = 0;
const MPM_MATERIAL_FLUID = 2;

export interface MPMFlowOptions {
    /** Pool simulado: `MPMFluidSchema` (fluido, default) ou `MPMSoftSchema` (sólido elástico). */
    readonly bodyType?: string;
    /** Mínimo de substeps por passo (default 1); o passo estável do `ParticleMaterial` pode exigir mais. */
    readonly substeps?: number;
}

/**
 * MPMFlow — corpos por Material Point Method (MLS-MPM: limpa grade → P2G → atualização da grade → G2P): fluido
 * fracamente compressível (`MPMFluidSchema`) ou sólido neo-Hookean (`MPMSoftSchema`). O quadro executa
 * `time.steps × substeps` iterações, com `substeps` pelo passo estável do `ParticleMaterial`, cada uma com a sua região
 * de `MPMSimParams` (`dt = stepDt / substeps`, `dt_frame = stepDt`) ligada por offset dinâmico. Massa, volume, grade
 * (célula 2s sobre o domínio), módulo volumétrico e Lamé vêm do material.
 */
export class MPMFlow extends Flow {
    readonly type = 'MPMFlow';
    readonly bodyType: string;
    readonly phase: Phase = 'physics';

    private readonly substeps: number;
    /** Grade corrente (do material); a grade de GPU é recriada quando muda. */
    private grid: ReturnType<ParticleMaterial['gridFor']> = ParticleMaterial.defaults.gridFor(
        ParticleMaterial.defaults.mpmCellSize,
    );
    private gridKey = '';

    private readonly params: PerStepUniforms;
    private gridBuffer: StorageBufferSpec | null = null;
    /** Pools de collider e mapas de dono (grupo 2 do kernel de colisão). */
    private readonly colliders: ColliderSet;
    /** `colliders.generation` com que os kernels foram criados. */
    private collidersGeneration = -1;
    private clearGridKernel: ComputeKernel | null = null;
    private p2gKernel: ComputeKernel | null = null;
    private gridUpdateKernel: ComputeKernel | null = null;
    private g2pKernel: ComputeKernel | null = null;
    /** Projeção das partículas para fora dos colliders depois do G2P. */
    private collisionKernel: ComputeKernel | null = null;

    constructor(
        private readonly core: EngineCore,
        private readonly world: World,
        private readonly resources: ResourceSystem,
        options: MPMFlowOptions = {},
    ) {
        super();
        this.bodyType = options.bodyType ?? 'MPMFluidSchema';
        this.substeps = Math.max(1, options.substeps ?? 1);
        this.params = new PerStepUniforms(core, {
            discriminator: 'mpm_params',
            byteSize: MPM_SIM_PARAMS_BYTE_SIZE,
        });
        this.colliders = new ColliderSet(core, world, resources, {
            discriminator: 'mpm_colliders',
        });
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [
            {
                id: 'pipeline_mpm_p2g',
                role: 'compute',
                shader: mpmP2G,
                entryPoints: ['mpm_p2g_main'],
                consumes: [this.bodyType, 'GravityField'],
            },
            {
                id: 'pipeline_mpm_grid_update',
                role: 'compute',
                shader: mpmGridUpdate,
                entryPoints: ['mpm_grid_update_main'],
                consumes: [this.bodyType, 'GravityField'],
            },
            {
                id: 'pipeline_mpm_g2p',
                role: 'compute',
                shader: mpmG2P,
                entryPoints: ['mpm_g2p_main'],
                consumes: [this.bodyType, 'GravityField'],
            },
            {
                id: 'pipeline_mpm_particle_collision',
                role: 'compute',
                shader: mpmParticleCollision,
                entryPoints: ['mpm_particle_collision_main'],
                consumes: [this.bodyType],
            },
        ];
    }

    /** Descarte do estágio: libera kernels, parâmetros, grade e colisores. */
    override dispose(): void {
        this.invalidateKernels();
        this.params.dispose();
        if (this.gridBuffer !== null) this.core.destroy(this.gridBuffer);
        this.colliders.destroy();
        this.gridBuffer = null;
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
        // Pool buffer mudou — invalida kernels que referenciam o particles buffer.
        if (poolKey === this.bodyType) this.invalidateParticleKernels();
    }

    /** Libera e esquece os kernels que ligam o buffer de partículas. */
    private invalidateParticleKernels(): void {
        for (const k of [
            this.p2gKernel,
            this.gridUpdateKernel,
            this.g2pKernel,
            this.collisionKernel,
        ]) {
            if (k !== null) destroyComputeKernel(this.core, k);
        }
        this.p2gKernel = null;
        this.gridUpdateKernel = null;
        this.g2pKernel = null;
        this.collisionKernel = null;
    }

    /** Libera todos os kernels (o buffer de parâmetros mudou). */
    private invalidateKernels(): void {
        if (this.clearGridKernel !== null) destroyComputeKernel(this.core, this.clearGridKernel);
        this.clearGridKernel = null;
        this.invalidateParticleKernels();
    }

    private gridCellCount(): number {
        return this.grid.gridDim[0] * this.grid.gridDim[1] * this.grid.gridDim[2];
    }

    /** Grade pelo material (célula 2s sobre o domínio); recria o buffer e os kernels quando muda. */
    private ensureGrid(material: ParticleMaterial): void {
        const grid = material.gridFor(material.mpmCellSize);
        const key = `${grid.cellSize}|${grid.gridDim.join(',')}|${grid.origin.join(',')}`;
        if (key === this.gridKey) return;
        this.grid = grid;
        this.gridKey = key;
        if (this.gridBuffer !== null) this.core.destroy(this.gridBuffer);
        this.gridBuffer = null;
        this.invalidateKernels();
    }

    private ensureGpuObjects(): void {
        if (this.gridBuffer === null) {
            this.gridBuffer = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: 'mpm_grid',
                byteSize: this.gridCellCount() * MPM_GRID_NODE_SIZE,
            });
        }
        const particlesBuf = this.resources.poolBufferSpec(this.bodyType);
        if (particlesBuf === undefined) return;

        // Bindgroups por slot (compartilhados conceitualmente entre os 4 kernels;
        // cada kernel cria sua própria cópia via discriminator único).
        const paramsGroup = {
            bindings: [this.params.binding(0)],
        };
        const gridGroup = {
            bindings: [{ binding: 0, type: 'storage' as const, buffer: this.gridBuffer }],
        };
        const particlesGroup = {
            bindings: [{ binding: 0, type: 'storage' as const, buffer: particlesBuf }],
        };
        const collidersGroup = { bindings: this.colliders.bindings() };

        if (this.clearGridKernel === null) {
            this.clearGridKernel = createComputeKernel(this.core, {
                discriminator: 'mpm_clear_grid',
                shader: mpmClearGrid,
                entryPoint: 'mpm_clear_grid_main',
                bindGroups: [paramsGroup, gridGroup],
            });
        }
        if (this.p2gKernel === null) {
            this.p2gKernel = createComputeKernel(this.core, {
                discriminator: 'mpm_p2g',
                shader: mpmP2G,
                entryPoint: 'mpm_p2g_main',
                bindGroups: [paramsGroup, gridGroup, particlesGroup],
            });
        }
        if (this.gridUpdateKernel === null) {
            this.gridUpdateKernel = createComputeKernel(this.core, {
                discriminator: 'mpm_grid_update',
                shader: mpmGridUpdate,
                entryPoint: 'mpm_grid_update_main',
                bindGroups: [paramsGroup, gridGroup, collidersGroup],
            });
        }
        if (this.g2pKernel === null) {
            this.g2pKernel = createComputeKernel(this.core, {
                discriminator: 'mpm_g2p',
                shader: mpmG2P,
                entryPoint: 'mpm_g2p_main',
                bindGroups: [paramsGroup, gridGroup, particlesGroup],
            });
        }
        if (this.collisionKernel === null) {
            this.collisionKernel = createComputeKernel(this.core, {
                discriminator: 'mpm_particle_collision',
                shader: mpmParticleCollision,
                entryPoint: 'mpm_particle_collision_main',
                bindGroups: [paramsGroup, particlesGroup, collidersGroup],
            });
        }
    }

    /** Preenche a região `region` de `MPMSimParams` com o `dt` da iteração e do passo. */
    private fillParams(
        region: number,
        particleCount: number,
        dtSub: number,
        stepDt: number,
        accel: readonly number[],
        material: ParticleMaterial,
        substeps: number,
    ): void {
        const f32 = this.params.f32(region);
        const u32 = this.params.u32(region);
        f32[0] = accel[0] ?? 0;
        f32[1] = accel[1] ?? -9.81;
        f32[2] = accel[2] ?? 0;
        f32[3] = dtSub;
        const { mu, lambda } = material.lame;
        f32[4] = mu;
        f32[5] = lambda;
        f32[6] = MPM_FIXED_SCALE;
        f32[7] = material.particleMass;
        f32[8] = material.particleVolume;
        f32[9] = material.bulkModulus;
        f32[10] = material.viscosity;
        f32[11] = stepDt;
        u32[12] = particleCount;
        u32[13] = this.grid.gridDim[0];
        u32[14] = this.grid.gridDim[1];
        u32[15] = this.grid.gridDim[2];
        f32[16] = this.grid.origin[0];
        f32[17] = this.grid.origin[1];
        f32[18] = this.grid.origin[2];
        f32[19] = this.grid.cellSize;
        u32[20] = 0;
        u32[21] = this.bodyType === 'MPMFluidSchema' ? MPM_MATERIAL_FLUID : MPM_MATERIAL_ELASTIC;
        u32[22] = substeps;
        f32[23] = 1.0 / this.grid.cellSize;
    }

    dispatch(frame: Frame): void {
        const time = this.world.findResource(Time.schema, Time);
        const steps = time?.steps ?? 0;
        if (time === undefined || steps === 0) return;
        const count = this.resources.poolCount(this.bodyType);
        if (count === 0) return;
        const material = ParticleMaterial.of(this.world);
        this.ensureGrid(material);
        const substeps = ParticleMaterial.substepsFor(
            time.stepDt,
            material.mpmStableDt,
            this.substeps,
        );
        const iterations = steps * substeps;
        if (this.params.reserve(iterations)) this.invalidateKernels();
        const accel = (this.world.findResource(GravityField.schema, GravityField)?.data
            .acceleration as readonly number[] | undefined) ?? [0, -9.81, 0, 0];
        for (let i = 0; i < iterations; i++) {
            this.fillParams(
                i,
                count,
                time.stepDt / substeps,
                time.stepDt,
                accel,
                material,
                substeps,
            );
        }
        this.params.flush(iterations);

        this.colliders.refresh();
        if (this.colliders.generation !== this.collidersGeneration) {
            this.invalidateParticleKernels();
            this.collidersGeneration = this.colliders.generation;
        }
        this.ensureGpuObjects();
        const clear = this.clearGridKernel;
        const p2g = this.p2gKernel;
        const gridUpdate = this.gridUpdateKernel;
        const g2p = this.g2pKernel;
        const collision = this.collisionKernel;
        if (
            clear === null
            || p2g === null
            || gridUpdate === null
            || g2p === null
            || collision === null
        )
            return;

        const cells = this.gridCellCount();
        const run = (
            label: string,
            k: ComputeKernel,
            invocations: number,
            offset: number[],
        ): void => {
            frame.compute(label, (pass) => {
                pass.bind.setPipeline(k.pipeline);
                // Grupo 0 = parâmetros (offset dinâmico da iteração); demais grupos sem offset.
                k.bindGroups.forEach((bg, g) => {
                    pass.bind.setBindGroup(g, bg, g === 0 ? offset : undefined);
                });
                pass.dispatch.invocations(invocations, 64);
            });
        };
        for (let i = 0; i < iterations; i++) {
            const offset = [this.params.offset(i)];
            run('MPMFlow.clear_grid', clear, cells, offset);
            run('MPMFlow.p2g', p2g, count, offset);
            run('MPMFlow.grid_update', gridUpdate, cells, offset);
            run('MPMFlow.g2p', g2p, count, offset);
            run('MPMFlow.collision', collision, count, offset);
        }
    }
}
