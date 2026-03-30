/**
 * SPHComputePass — pipeline GPU WCSPH (Weakly Compressible SPH).
 *
 * Implementa PhysicsComputePass sem herança (padrão PBFComputePass).
 * Recebe um NeighborSearchGrid compartilhado via constructor.
 *
 * ## Sequência por substep
 *
 * ```
 * 1. encodeNeighborBuild
 * 2. dispatch sph_density    → ρᵢ = Σmⱼ·W₃
 * 3. dispatch sph_pressure   → pᵢ = k₀·[(ρᵢ/ρ₀)^γ − 1]
 * 4. dispatch sph_forces     → accel = g + f_press + f_visc; XSPH em color
 * 5. dispatch sph_integrate  → vel += dt·accel + xsph; pos += dt·vel
 * 6. dispatch sph_collision  → bounds AABB + colliders SDF
 * ```
 *
 * ## Buffers
 *
 *   Global: `gpu_sph_simparams` (uniform, 96 bytes)
 *   Por corpo: `gpu_sph_particles_{uuid}` (storage SPHParticle[], N × 64 bytes)
 */

import { WebGPUEngineCore }        from '../../../core/WebGPUEngineCore';
import type { EngineCore }         from '../../../core/interfaces/EngineCore';
import type { PhysicsComputePass } from '../../../scene/systems/PhysicsComputePass';
import type { GpuSimContext }      from '../../../scene/systems/GpuSimContext';
import type { Force }              from '../../../scene/systems/forces/Force';
import { PhysicsBodyState }        from '../../../scene/core/physics/PhysicsBodyState';
import { COLLIDERS_BUFFER_ID }     from '../shared/ColliderDescriptorUploader';
import {
    PIPELINE_IDS,
    ensurePhysicsPipelinesInitialized,
} from '../shared/ShaderLibrary';
import type { NeighborSearchGrid } from '../shared/NeighborSearchGrid';
import type { SPHBody }            from '../SPHBody';
import {
    SPH_SIM_PARAMS_BUFFER_ID,
    SPH_SIM_PARAMS_BYTES,
    SPH_PARTICLE_STRIDE_BYTES,
    SPH_PARTICLE_STRIDE_FLOATS,
    buildSPHBufferIds,
    packSPHParticles,
    type SPHBufferIds,
} from './SPHBufferLayout';
import {
    SPHSP_GRAVITY_X, SPHSP_GRAVITY_Y, SPHSP_GRAVITY_Z, SPHSP_DT_SUB,
    SPHSP_REST_RHO, SPHSP_H, SPHSP_STIFFNESS, SPHSP_GAMMA,
    SPHSP_VISCOSITY, SPHSP_XSPH_C, SPHSP_DT_FRAME,
    SPHSP_PARTICLE_COUNT, SPHSP_COLLIDER_COUNT, SPHSP_MAX_NEIGHBORS, SPHSP_PARTICLE_STRIDE,
    SPHSP_BOUND_MIN_X, SPHSP_BOUND_MIN_Y, SPHSP_BOUND_MIN_Z, SPHSP_RESTITUTION,
    SPHSP_PARTICLE_MASS, SPHSP_INV_MASS,
} from './SPHSimParamsLayout';

export interface SPHPassConfig {
    substeps?:    number;   // default: 4
    maxParticles?: number;  // default: 10000
    boundsMin?:   [number, number, number];  // default: [-10,-1,-10]
}

type SPHBodyBGs = {
    density:   GPUBindGroup;
    pressure:  GPUBindGroup;
    forces:    GPUBindGroup;
    integrate: GPUBindGroup;
    collision: GPUBindGroup;
};

type SPHGlobalBGs = {
    simParams:  GPUBindGroup;
    neighbors:  GPUBindGroup;
    colliders:  GPUBindGroup;
};

export class SPHComputePass implements PhysicsComputePass {

    public readonly passId = 'SPHBody';
    public readonly acceptedPhysicTypes: readonly string[] = ['SPHBody'];

    private core: EngineCore = WebGPUEngineCore.getInstance();
    private ready        = false;
    private initPromise: Promise<void> | null = null;
    private globalReady  = false;

    private readonly substeps:     number;
    private readonly maxParticles: number;
    private readonly boundsMin:    [number, number, number];

    private readonly neighborGrid: NeighborSearchGrid;

    private readonly bgCache = new Map<string, SPHBodyBGs>();
    private globalBG: SPHGlobalBGs | null = null;

    private readonly simParamsBuf = new ArrayBuffer(SPH_SIM_PARAMS_BYTES);
    private readonly simParamsF32 = new Float32Array(this.simParamsBuf);
    private readonly simParamsU32 = new Uint32Array(this.simParamsBuf);

    constructor(
        private readonly globalForces: Map<string, Force>,
        neighborGrid: NeighborSearchGrid,
        config?: SPHPassConfig,
    ) {
        this.neighborGrid  = neighborGrid;
        this.substeps      = config?.substeps     ?? 4;
        this.maxParticles  = config?.maxParticles  ?? 10000;
        this.boundsMin     = config?.boundsMin     ?? [-10, -1, -10];
    }

    // ── PhysicsComputePass ────────────────────────────────────────────────────

    public ensureReady(core: EngineCore): Promise<void> {
        this.core = core;
        if (!this.initPromise) this.kickInit();
        return this.initPromise ?? Promise.resolve();
    }

    public dispose(): void {
        this.bgCache.clear();
        this.globalBG = null;
        const buffers = this.core.resources.buffers;
        if (buffers.getBuffer(SPH_SIM_PARAMS_BUFFER_ID)) {
            buffers.destroyBuffer(SPH_SIM_PARAMS_BUFFER_ID);
        }
        this.neighborGrid.dispose();
    }

    public execute(context: GpuSimContext, dtFrame: number): void {
        if (!this.ready) { this.kickInit(); return; }
        if (dtFrame <= 0) return;

        if (!this.globalReady) this.createGlobalBuffers();
        if (!this.globalReady) return;

        const core    = this.core;
        const compute = core.compute;
        const buffers = core.resources.buffers;

        if (context.colliderBufferRecreated) {
            this.bgCache.clear();
            this.globalBG = null;
        }

        const activeBodies: SPHBody[] = [];
        for (const { body } of context.bodies.values()) {
            if (body.physicType !== 'SPHBody') continue;
            if (body.bodyState === PhysicsBodyState.Inactive) continue;
            const sph = body as unknown as SPHBody;
            if (!sph.bufferIds) this.allocateBody(sph);
            if (!sph.bufferIds) continue;
            if (sph.particles.length === 0) continue;
            activeBodies.push(sph);
        }
        if (activeBodies.length === 0) return;

        const firstBody      = activeBodies[0]!;
        const totalParticles = activeBodies.reduce((s, b) => s + b.particles.length, 0);
        const dtSub          = dtFrame / this.substeps;

        let gx = 0, gy = 0, gz = 0;
        for (const force of this.globalForces.values()) {
            const f = force.compute(firstBody, dtSub);
            gx += f[0] ?? 0; gy += f[1] ?? 0; gz += f[2] ?? 0;
        }

        const mass    = firstBody.get<number>('particleMass')    ?? 0.02;
        const restRho = firstBody.get<number>('restDensity')     ?? 1000;

        this.simParamsF32[SPHSP_GRAVITY_X]       = gx;
        this.simParamsF32[SPHSP_GRAVITY_Y]       = gy;
        this.simParamsF32[SPHSP_GRAVITY_Z]       = gz;
        this.simParamsF32[SPHSP_DT_SUB]          = dtSub;
        this.simParamsF32[SPHSP_REST_RHO]        = restRho;
        this.simParamsF32[SPHSP_H]               = firstBody.get<number>('smoothingRadius') ?? 0.1;
        this.simParamsF32[SPHSP_STIFFNESS]       = firstBody.get<number>('stiffness')       ?? 200;
        this.simParamsF32[SPHSP_GAMMA]           = firstBody.get<number>('gamma')           ?? 7;
        this.simParamsF32[SPHSP_VISCOSITY]       = firstBody.get<number>('viscosity')       ?? 0.01;
        this.simParamsF32[SPHSP_XSPH_C]         = firstBody.get<number>('xsph')            ?? 0.01;
        this.simParamsF32[SPHSP_DT_FRAME]        = dtFrame;
        this.simParamsU32[SPHSP_PARTICLE_COUNT]  = totalParticles;
        this.simParamsU32[SPHSP_COLLIDER_COUNT]  = context.colliderCount;
        this.simParamsU32[SPHSP_MAX_NEIGHBORS]   = 64;
        this.simParamsU32[SPHSP_PARTICLE_STRIDE] = SPH_PARTICLE_STRIDE_FLOATS;
        this.simParamsF32[SPHSP_BOUND_MIN_X]     = this.boundsMin[0];
        this.simParamsF32[SPHSP_BOUND_MIN_Y]     = this.boundsMin[1];
        this.simParamsF32[SPHSP_BOUND_MIN_Z]     = this.boundsMin[2];
        this.simParamsF32[SPHSP_RESTITUTION]     = firstBody.get<number>('restitution')    ?? 0;
        this.simParamsF32[SPHSP_PARTICLE_MASS]   = mass;
        this.simParamsF32[SPHSP_INV_MASS]        = mass > 0 ? 1 / mass : 0;
        buffers.writeBuffer(SPH_SIM_PARAMS_BUFFER_ID, this.simParamsF32);

        if (!this.globalBG) this.globalBG = this.buildGlobalBGs();
        if (!this.globalBG) return;

        for (const sph of activeBodies) {
            if (!this.bgCache.has(sph.uuid)) {
                this.bgCache.set(sph.uuid, this.buildBodyBGs(sph));
            }
        }

        const gbg = this.globalBG;

        try {
            const encoder = core.renderPasses.createCommandEncoder('sph_gpu');

            for (let s = 0; s < this.substeps; s++) {
                const firstBuf = buffers.getBuffer(activeBodies[0]!.bufferIds!.particlesId)!.native;
                this.neighborGrid.encodeNeighborBuild(
                    encoder,
                    firstBuf,
                    totalParticles,
                    SPH_PARTICLE_STRIDE_FLOATS,
                );

                for (const sph of activeBodies) {
                    const bg = this.bgCache.get(sph.uuid)!;
                    const wg = Math.ceil(sph.particles.length / 64);

                    const densPass = compute.beginComputePassExplicit(encoder, `sph_density_${s}`);
                    compute.dispatchOnPass(densPass, PIPELINE_IDS.SPH_DENSITY,
                        [gbg.simParams, bg.density, gbg.neighbors], wg);
                    densPass.end();

                    const presPass = compute.beginComputePassExplicit(encoder, `sph_pressure_${s}`);
                    compute.dispatchOnPass(presPass, PIPELINE_IDS.SPH_PRESSURE,
                        [gbg.simParams, bg.pressure], wg);
                    presPass.end();

                    const frcPass = compute.beginComputePassExplicit(encoder, `sph_forces_${s}`);
                    compute.dispatchOnPass(frcPass, PIPELINE_IDS.SPH_FORCES,
                        [gbg.simParams, bg.forces, gbg.neighbors], wg);
                    frcPass.end();

                    const intPass = compute.beginComputePassExplicit(encoder, `sph_integrate_${s}`);
                    compute.dispatchOnPass(intPass, PIPELINE_IDS.SPH_INTEGRATE,
                        [gbg.simParams, bg.integrate], wg);
                    intPass.end();

                    const colPass = compute.beginComputePassExplicit(encoder, `sph_collision_${s}`);
                    compute.dispatchOnPass(colPass, PIPELINE_IDS.SPH_COLLISION,
                        [gbg.simParams, bg.collision, gbg.colliders], wg);
                    colPass.end();
                }
            }

            core.renderPasses.submit([encoder]);
        } catch (err) {
            console.error('[SPHComputePass] encode falhou:', err);
            this.bgCache.clear();
            this.globalBG = null;
        }
    }

    // ── Alocação por corpo ────────────────────────────────────────────────────

    private allocateBody(sph: SPHBody): void {
        const buffers   = this.core.resources.buffers;
        const n         = sph.particles.length;
        if (n === 0) return;

        const ids       = buildSPHBufferIds(sph.uuid);
        const restRho   = sph.get<number>('restDensity') ?? 1000;
        buffers.createStorageBuffer(ids.particlesId, Math.max(n, 1) * SPH_PARTICLE_STRIDE_BYTES);

        const f32 = new Float32Array(n * SPH_PARTICLE_STRIDE_FLOATS);
        packSPHParticles(sph.particles, f32, restRho);
        buffers.writeBuffer(ids.particlesId, f32);

        sph.bufferIds = ids;
    }

    // ── Buffers globais ───────────────────────────────────────────────────────

    private createGlobalBuffers(): void {
        this.core.resources.buffers.createUniformBuffer(SPH_SIM_PARAMS_BUFFER_ID, SPH_SIM_PARAMS_BYTES);
        this.globalReady = true;
    }

    // ── Bind groups ───────────────────────────────────────────────────────────

    private buildGlobalBGs(): SPHGlobalBGs | null {
        const compute = this.core.compute;
        const buffers = this.core.resources.buffers;

        const simBuf  = buffers.getBuffer(SPH_SIM_PARAMS_BUFFER_ID)?.native;
        const colBuf  = buffers.getBuffer(COLLIDERS_BUFFER_ID)?.native;
        if (!simBuf || !colBuf) return null;

        const nbListBuf  = this.neighborGrid.getNeighborListBuffer();
        const nbCountBuf = this.neighborGrid.getNeighborCountBuffer();

        const bg = (id: string, grp: number, entries: GPUBindGroupEntry[], label: string) =>
            compute.createBindGroupFromPipeline(id, grp, entries, label);

        return {
            simParams: bg(PIPELINE_IDS.SPH_DENSITY,  0, [{ binding: 0, resource: { buffer: simBuf } }], 'sph_bg_sim'),
            neighbors: bg(PIPELINE_IDS.SPH_DENSITY,  2, [
                { binding: 0, resource: { buffer: nbListBuf  } },
                { binding: 1, resource: { buffer: nbCountBuf } },
            ], 'sph_bg_neighbors'),
            colliders: bg(PIPELINE_IDS.SPH_COLLISION, 2, [{ binding: 0, resource: { buffer: colBuf } }], 'sph_bg_colliders'),
        };
    }

    private buildBodyBGs(sph: SPHBody): SPHBodyBGs {
        const compute = this.core.compute;
        const buffers = this.core.resources.buffers;
        const pBuf    = buffers.getBuffer(sph.bufferIds!.particlesId)!.native;
        const uid     = sph.uuid.slice(0, 8);

        const bg = (id: string, grp: number, entries: GPUBindGroupEntry[], label: string) =>
            compute.createBindGroupFromPipeline(id, grp, entries, label);

        const pEntry = { binding: 0, resource: { buffer: pBuf } };

        return {
            density:   bg(PIPELINE_IDS.SPH_DENSITY,   1, [pEntry], `sph_density_${uid}`),
            pressure:  bg(PIPELINE_IDS.SPH_PRESSURE,  1, [pEntry], `sph_pressure_${uid}`),
            forces:    bg(PIPELINE_IDS.SPH_FORCES,    1, [pEntry], `sph_forces_${uid}`),
            integrate: bg(PIPELINE_IDS.SPH_INTEGRATE, 1, [pEntry], `sph_integrate_${uid}`),
            collision: bg(PIPELINE_IDS.SPH_COLLISION, 1, [pEntry], `sph_collision_${uid}`),
        };
    }

    // ── Init ─────────────────────────────────────────────────────────────────

    private kickInit(): void {
        this.initPromise = ensurePhysicsPipelinesInitialized(this.core)
            .then(() => { this.ready = true; })
            .catch(err => {
                console.error('[SPHComputePass] falha na compilação de pipeline:', err);
                this.initPromise = null;
            });
    }
}
