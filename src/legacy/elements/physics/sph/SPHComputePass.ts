/**
 * SPHComputePass — pipeline GPU WCSPH (Weakly Compressible SPH).
 *
 * Estende FluidComputePassBase; implementa apenas a lógica específica de SPH.
 *
 * ## Sequência por substep
 *
 * ```
 * 1. encodeNeighborBuild
 * 2. dispatch sph_density    → ρᵢ = Σmⱼ·W₃
 * 3. dispatch sph_pressure   → pᵢ = k₀·[(ρᵢ/ρ₀)^γ − 1]
 * 4. dispatch sph_forces     → accel = g + f_press + f_visc(∇²W_visc); XSPH
 * 5. dispatch sph_integrate  → vel += dt·accel + xsph; pos += dt·vel
 * 6. dispatch sph_collision  → bounds AABB + colliders SDF
 * ```
 *
 * ## Buffers
 *
 *   Global: `gpu_sph_simparams` (uniform, 96 bytes)
 *   Por corpo: `gpu_sph_particles_{uuid}` (storage SPHParticle[], N × 64 bytes)
 */

import { FluidComputePassBase }    from '../shared/FluidComputePassBase';
import type { Force }              from '../../../scene/systems/forces/Force';
import { COLLIDERS_BUFFER_ID }     from '../shared/ColliderDescriptorUploader';
import { PIPELINE_IDS }            from '../shared/ShaderLibrary';
import type { NeighborSearchGrid } from '../shared/NeighborSearchGrid';
import type { SPHBody }            from '../SPHBody';
import {
    SPH_SIM_PARAMS_BUFFER_ID,
    SPH_SIM_PARAMS_BYTES,
    SPH_PARTICLE_STRIDE_BYTES,
    SPH_PARTICLE_STRIDE_FLOATS,
    buildSPHBufferIds,
    packSPHParticles,
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
    boundsMin?:   [number, number, number];
}

type SPHBodyBGs = {
    density:   GPUBindGroup;
    pressure:  GPUBindGroup;
    forces:    GPUBindGroup;
    integrate: GPUBindGroup;
    collision: GPUBindGroup;
};

type SPHGlobalBGs = {
    simParams: GPUBindGroup;
    neighbors: GPUBindGroup;
    colliders: GPUBindGroup;
};

export class SPHComputePass extends FluidComputePassBase<SPHBody, SPHGlobalBGs, SPHBodyBGs> {

    public readonly passId = 'SPHBody';
    public readonly acceptedPhysicTypes: readonly string[] = ['SPHBody'];

    protected readonly simParamsBufferId    = SPH_SIM_PARAMS_BUFFER_ID;
    protected readonly particleStrideFloats = SPH_PARTICLE_STRIDE_FLOATS;

    constructor(
        globalForces: Map<string, Force>,
        neighborGrid: NeighborSearchGrid,
        config?: SPHPassConfig,
    ) {
        super(
            globalForces,
            neighborGrid,
            config?.substeps  ?? 4,
            config?.boundsMin ?? [-10, -1, -10],
            SPH_SIM_PARAMS_BYTES,
        );
    }

    // ── Alocação ──────────────────────────────────────────────────────────────

    protected allocateBody(sph: SPHBody): void {
        const buffers = this.core.resources.buffers;
        const n       = sph.particles.length;
        if (n === 0) return;

        const ids     = buildSPHBufferIds(sph.uuid);
        const restRho = sph.get<number>('restDensity') ?? 1000;
        buffers.createStorageBuffer(ids.particlesId, Math.max(n, 1) * SPH_PARTICLE_STRIDE_BYTES);

        const f32 = new Float32Array(n * SPH_PARTICLE_STRIDE_FLOATS);
        packSPHParticles(sph.particles, f32, restRho);
        buffers.writeBuffer(ids.particlesId, f32);

        sph.bufferIds = ids;
    }

    // ── SimParams ─────────────────────────────────────────────────────────────

    protected writeSimParams(
        bodies: SPHBody[], dtFrame: number, dtSub: number,
        totalParticles: number, colliderCount: number,
        gx: number, gy: number, gz: number,
    ): void {
        const f32  = this.simParamsF32;
        const u32  = this.simParamsU32;
        const b    = bodies[0]!;
        const mass = b.get<number>('particleMass') ?? 0.02;

        f32[SPHSP_GRAVITY_X]       = gx;
        f32[SPHSP_GRAVITY_Y]       = gy;
        f32[SPHSP_GRAVITY_Z]       = gz;
        f32[SPHSP_DT_SUB]          = dtSub;
        f32[SPHSP_REST_RHO]        = b.get<number>('restDensity')     ?? 1000;
        f32[SPHSP_H]               = b.get<number>('smoothingRadius') ?? 0.1;
        f32[SPHSP_STIFFNESS]       = b.get<number>('stiffness')       ?? 200;
        f32[SPHSP_GAMMA]           = b.get<number>('gamma')           ?? 7;
        f32[SPHSP_VISCOSITY]       = b.get<number>('viscosity')       ?? 0.01;
        f32[SPHSP_XSPH_C]         = b.get<number>('xsph')            ?? 0.01;
        f32[SPHSP_DT_FRAME]        = dtFrame;
        u32[SPHSP_PARTICLE_COUNT]  = totalParticles;
        u32[SPHSP_COLLIDER_COUNT]  = colliderCount;
        u32[SPHSP_MAX_NEIGHBORS]   = 64;
        u32[SPHSP_PARTICLE_STRIDE] = SPH_PARTICLE_STRIDE_FLOATS;
        f32[SPHSP_BOUND_MIN_X]     = this.boundsMin[0];
        f32[SPHSP_BOUND_MIN_Y]     = this.boundsMin[1];
        f32[SPHSP_BOUND_MIN_Z]     = this.boundsMin[2];
        f32[SPHSP_RESTITUTION]     = b.get<number>('restitution') ?? 0;
        f32[SPHSP_PARTICLE_MASS]   = mass;
        f32[SPHSP_INV_MASS]        = mass > 0 ? 1 / mass : 0;
    }

    // ── Bind groups ───────────────────────────────────────────────────────────

    protected buildGlobalBGs(): SPHGlobalBGs | null {
        const compute = this.core.compute;
        const buffers = this.core.resources.buffers;

        const simBuf = buffers.getBuffer(SPH_SIM_PARAMS_BUFFER_ID)?.native;
        const colBuf = buffers.getBuffer(COLLIDERS_BUFFER_ID)?.native;
        if (!simBuf || !colBuf) return null;

        const nbListBuf  = this.neighborGrid.getNeighborListBuffer();
        const nbCountBuf = this.neighborGrid.getNeighborCountBuffer();

        const bg = (id: string, grp: number, entries: GPUBindGroupEntry[], label: string) =>
            compute.createBindGroupFromPipeline(id, grp, entries, label);

        return {
            simParams: bg(PIPELINE_IDS.SPH_DENSITY,  0,
                [{ binding: 0, resource: { buffer: simBuf } }], 'sph_bg_sim'),
            neighbors: bg(PIPELINE_IDS.SPH_DENSITY,  2, [
                { binding: 0, resource: { buffer: nbListBuf  } },
                { binding: 1, resource: { buffer: nbCountBuf } },
            ], 'sph_bg_neighbors'),
            colliders: bg(PIPELINE_IDS.SPH_COLLISION, 2,
                [{ binding: 0, resource: { buffer: colBuf } }], 'sph_bg_colliders'),
        };
    }

    protected buildBodyBGs(sph: SPHBody): SPHBodyBGs {
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

    // ── Substep ───────────────────────────────────────────────────────────────

    protected encodeSubstep(
        encoder: GPUCommandEncoder,
        _body: SPHBody,
        gbg: SPHGlobalBGs,
        bg: SPHBodyBGs,
        wg: number,
        s: number,
    ): void {
        const compute = this.core.compute;

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
