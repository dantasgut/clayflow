/**
 * MPMComputePass — pipeline GPU MLS-MPM para corpos deformáveis e fluidos.
 *
 * Implementa PhysicsComputePass (sem herança de ComputePassBase, análogo a FEMComputePass).
 * Gerencia uma grade euleriana global compartilhada entre todos os MPMBody da cena.
 *
 * ## Sequência por frame
 *
 * ```
 * 1. writeSimParams — escreve MPMSimParams no uniform global
 * 2. Cria encoder único
 * 3. encoder.clearBuffer(grid) — zera toda a grade (reset atômico)
 * 4. Para cada substep:
 *    Para cada MPMBody ativo:
 *      4a. mpm_p2g — partículas → grade (atomicAdd)
 *    4b. mpm_grid_update — normaliza + gravity + boundary + colisão SDF
 *    Para cada MPMBody ativo:
 *      4c. mpm_g2p — grade → partículas (vel, C, F, pos)
 * 5. Para cada MPMBody com Geometry:
 *    5a. mpm_vertex_write — pos.xyz → vertex buffer
 * 6. submit encoder
 * ```
 *
 * ## Buffers globais (criados no construtor, compartilhados)
 *
 *   `MPM_GRID_BUFFER_ID`       — storage MPMGridNode[] (grid_x × grid_y × grid_z × 32 bytes)
 *   `MPM_SIM_PARAMS_BUFFER_ID` — uniform MPMSimParams (96 bytes)
 *
 * ## Buffers por corpo (criados em allocateBody)
 *
 *   `gpu_mpm_particles_{uuid}` — storage MPMParticle[] (N × 128 bytes)
 *
 * ## Binding groups por kernel
 *
 *   group(0): MPMSimParams   (uniform)
 *   group(1): MPMGridNode[]  (storage read_write — atomic<i32>)
 *   group(2): MPMParticle[]  (storage read/read_write, varia por corpo)
 *   group(3): ColliderDesc[] / VertexBuffer (auxiliar)
 *
 * Arquitetura: Layer 3 → Facade Layer 1 (WebGPUEngineCore.getInstance()).
 */

import { WebGPUEngineCore }            from '../../../core/WebGPUEngineCore';
import type { EngineCore }             from '../../../core/interfaces/EngineCore';
import type { PhysicsComputePass }     from '../../../scene/systems/PhysicsComputePass';
import type { GpuSimContext }          from '../../../scene/systems/GpuSimContext';
import type { Force }                  from '../../../scene/systems/forces/Force';
import type { Geometry }               from '../../../scene/components/Geometry';
import { PhysicsBodyState }            from '../../../scene/core/physics/PhysicsBodyState';
import { COLLIDERS_BUFFER_ID }         from '../shared/ColliderDescriptorUploader';
import {
    PIPELINE_IDS,
    ensurePhysicsPipelinesInitialized,
} from '../shared/ShaderLibrary';
import type { MPMBody }                from '../MPMBody';
import {
    MPM_GRID_BUFFER_ID,
    MPM_SIM_PARAMS_BUFFER_ID,
    MPM_PARTICLE_STRIDE_BYTES,
    MPM_GRID_NODE_STRIDE_BYTES,
    MPM_SIM_PARAMS_BYTES,
    buildMPMBufferIds,
    packMPMParticles,
    type MPMBufferIds,
} from './MPMBufferLayout';
import {
    MSP_GRAVITY_X, MSP_GRAVITY_Y, MSP_GRAVITY_Z,
    MSP_DT_SUB, MSP_MU, MSP_LAMBDA_LAME, MSP_FIXED_SCALE,
    MSP_HARDENING, MSP_THETA_C, MSP_THETA_S, MSP_VISCOSITY, MSP_DT_FRAME,
    MSP_PARTICLE_COUNT, MSP_GRID_X, MSP_GRID_Y, MSP_GRID_Z,
    MSP_GRID_ORIGIN_X, MSP_GRID_ORIGIN_Y, MSP_GRID_ORIGIN_Z,
    MSP_CELL_SIZE, MSP_COLLIDER_COUNT, MSP_MATERIAL_ID,
    MSP_SUBSTEP_COUNT, MSP_INV_DX,
    MPM_MATERIAL_ELASTIC, MPM_MATERIAL_SNOW, MPM_MATERIAL_FLUID, MPM_MATERIAL_SAND,
} from './MPMSimParamsLayout';

const FIXED_SCALE_DEFAULT = 1 << 20;  // 1 048 576

/** Bind groups por corpo (reutilizados entre frames). */
type MPMBodyBindGroups = {
    p2g:         GPUBindGroup;   // group(2) particles para p2g
    g2p:         GPUBindGroup;   // group(2) particles para g2p
    vertexWrite?: GPUBindGroup;  // group(2) particles para vertex_write
    vertexVbuf?:  GPUBindGroup;  // group(3) vertex buffer
};

/** Bind groups globais (criados uma vez, reutilizados entre corpos e frames). */
type MPMGlobalBindGroups = {
    simParamsForP2G:    GPUBindGroup;  // group(0) — params
    gridForP2G:         GPUBindGroup;  // group(1) — grid
    gridForGridUpdate:  GPUBindGroup;  // group(1) — grid
    gridForG2P:         GPUBindGroup;  // group(1) — grid
    gridForUpdate:      GPUBindGroup;  // group(0+1 para grid_update)
    simParamsUpdate:    GPUBindGroup;  // group(0) — params for grid_update
    collidersForUpdate: GPUBindGroup;  // group(3) — colliders
};

export interface MPMConfig {
    /** Dimensões da grade. Default: [64, 64, 64]. */
    gridDims?:    [number, number, number];
    /** Tamanho de célula em metros. Default: 1/64. */
    cellSize?:    number;
    /** Canto mínimo da grade em world space. Default: [0, 0, 0]. */
    gridOrigin?:  [number, number, number];
}

export class MPMComputePass implements PhysicsComputePass {

    public readonly passId = 'MLSMPMBody';
    public readonly acceptedPhysicTypes: readonly string[] = ['MPMBody'];

    private core: EngineCore = WebGPUEngineCore.getInstance();
    private ready        = false;
    private initPromise: Promise<void> | null = null;
    private globalReady  = false;  // buffers globais criados

    /** Dimensões e parâmetros da grade. */
    private readonly gridX:    number;
    private readonly gridY:    number;
    private readonly gridZ:    number;
    private readonly cellSize: number;
    private readonly gridOrigin: [number, number, number];
    private readonly gridTotal:  number;

    /** Bind groups cacheados por uuid do MPMBody. */
    private readonly bgCache = new Map<string, MPMBodyBindGroups>();

    /** Bind groups globais (grade + params + colliders). */
    private globalBG: MPMGlobalBindGroups | null = null;

    private readonly simParamsBuf = new ArrayBuffer(MPM_SIM_PARAMS_BYTES);
    private readonly simParamsF32 = new Float32Array(this.simParamsBuf);
    private readonly simParamsU32 = new Uint32Array(this.simParamsBuf);

    constructor(
        private readonly globalForces: Map<string, Force>,
        private readonly getSubsteps:  () => number,
        config?: MPMConfig,
    ) {
        const dims      = config?.gridDims   ?? [64, 64, 64];
        this.gridX      = dims[0]!;
        this.gridY      = dims[1]!;
        this.gridZ      = dims[2]!;
        this.cellSize   = config?.cellSize   ?? (1 / 64);
        this.gridOrigin = config?.gridOrigin ?? [0, 0, 0];
        this.gridTotal  = this.gridX * this.gridY * this.gridZ;
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
        if (buffers.getBuffer(MPM_GRID_BUFFER_ID))       buffers.destroyBuffer(MPM_GRID_BUFFER_ID);
        if (buffers.getBuffer(MPM_SIM_PARAMS_BUFFER_ID)) buffers.destroyBuffer(MPM_SIM_PARAMS_BUFFER_ID);
    }

    public execute(context: GpuSimContext, dtFrame: number): void {
        if (!this.ready) { this.kickInit(); return; }
        if (dtFrame <= 0) return;

        if (!this.globalReady) this.createGlobalBuffers();
        if (!this.globalReady) return;

        const substeps = this.getSubsteps();
        const dtSub    = dtFrame / substeps;
        const core     = this.core;
        const compute  = core.compute;
        const buffers  = core.resources.buffers;
        const colliderCount = context.colliderCount;

        if (context.colliderBufferRecreated) {
            this.bgCache.clear();
            this.globalBG = null;
        }

        // Coleta corpos ativos
        const activeBodies: { body: MPMBody; geo?: Geometry }[] = [];
        for (const { body, entity } of context.bodies.values()) {
            if (body.physicType !== 'MPMBody') continue;
            if (body.bodyState === PhysicsBodyState.Inactive) continue;
            const mpm = body as unknown as MPMBody;
            if (!mpm.bufferIds) this.allocateBody(mpm);
            if (!mpm.bufferIds) continue;
            if (mpm.particles.length === 0) continue;
            const geo = entity.getComponent<Geometry>('Geometry');
            activeBodies.push({ body: mpm, ...(geo ? { geo } : {}) });
        }
        if (activeBodies.length === 0) return;

        // Toma o primeiro corpo para material params (grade única — um material dominante)
        const firstBody = activeBodies[0]!.body;
        const E   = firstBody.get<number>('E')  ?? 1e5;
        const nu  = firstBody.get<number>('nu') ?? 0.2;
        const mu  = E / (2 * (1 + nu));
        const lam = E * nu / ((1 + nu) * (1 - 2 * nu));

        const matStr = firstBody.get<string>('material') ?? 'elastic';
        const materialId = matStr === 'snow' ? MPM_MATERIAL_SNOW
                         : matStr === 'fluid' ? MPM_MATERIAL_FLUID
                         : matStr === 'sand'  ? MPM_MATERIAL_SAND
                         : MPM_MATERIAL_ELASTIC;

        const totalParticles = activeBodies.reduce((s, { body }) => s + body.particles.length, 0);

        let gx = 0, gy = 0, gz = 0;
        for (const force of this.globalForces.values()) {
            const f = force.compute(firstBody, dtSub);
            gx += f[0] ?? 0;
            gy += f[1] ?? 0;
            gz += f[2] ?? 0;
        }

        this.simParamsF32[MSP_GRAVITY_X]      = gx;
        this.simParamsF32[MSP_GRAVITY_Y]      = gy;
        this.simParamsF32[MSP_GRAVITY_Z]      = gz;
        this.simParamsF32[MSP_DT_SUB]         = dtSub;
        this.simParamsF32[MSP_MU]             = mu;
        this.simParamsF32[MSP_LAMBDA_LAME]    = lam;
        this.simParamsF32[MSP_FIXED_SCALE]    = FIXED_SCALE_DEFAULT;
        this.simParamsF32[MSP_HARDENING]      = firstBody.get<number>('hardening') ?? 10;
        this.simParamsF32[MSP_THETA_C]        = firstBody.get<number>('thetaC')    ?? 2.5e-2;
        this.simParamsF32[MSP_THETA_S]        = firstBody.get<number>('thetaS')    ?? 7.5e-3;
        this.simParamsF32[MSP_VISCOSITY]      = firstBody.get<number>('viscosity') ?? 0;
        this.simParamsF32[MSP_DT_FRAME]       = dtFrame;
        this.simParamsU32[MSP_PARTICLE_COUNT] = totalParticles;
        this.simParamsU32[MSP_GRID_X]         = this.gridX;
        this.simParamsU32[MSP_GRID_Y]         = this.gridY;
        this.simParamsU32[MSP_GRID_Z]         = this.gridZ;
        this.simParamsF32[MSP_GRID_ORIGIN_X]  = this.gridOrigin[0];
        this.simParamsF32[MSP_GRID_ORIGIN_Y]  = this.gridOrigin[1];
        this.simParamsF32[MSP_GRID_ORIGIN_Z]  = this.gridOrigin[2];
        this.simParamsF32[MSP_CELL_SIZE]      = this.cellSize;
        this.simParamsU32[MSP_COLLIDER_COUNT] = colliderCount;
        this.simParamsU32[MSP_MATERIAL_ID]    = materialId;
        this.simParamsU32[MSP_SUBSTEP_COUNT]  = substeps;
        this.simParamsF32[MSP_INV_DX]         = 1 / this.cellSize;
        buffers.writeBuffer(MPM_SIM_PARAMS_BUFFER_ID, this.simParamsF32);

        // Garante bind groups globais
        if (!this.globalBG) {
            this.globalBG = this.buildGlobalBindGroups();
        }
        if (!this.globalBG) return;

        // Garante bind groups por corpo
        for (const { body, geo } of activeBodies) {
            if (!this.bgCache.has(body.uuid)) {
                const bg = this.buildBodyBindGroups(body, geo?.vertexBufferId);
                this.bgCache.set(body.uuid, bg);
            }
        }

        const gbg = this.globalBG;

        try {
            const encoder = core.renderPasses.createCommandEncoder('mpm_gpu');

            // ── Reset da grade ────────────────────────────────────────────────
            const gridBuf = buffers.getBuffer(MPM_GRID_BUFFER_ID)!.native;
            encoder.clearBuffer(gridBuf, 0, this.gridTotal * MPM_GRID_NODE_STRIDE_BYTES);

            for (let s = 0; s < substeps; s++) {
                // ── P2G: para cada corpo ──────────────────────────────────────
                for (const { body } of activeBodies) {
                    const bg = this.bgCache.get(body.uuid)!;
                    const wg = Math.ceil(body.particles.length / 64);
                    const p2gPass = compute.beginComputePassExplicit(encoder, `mpm_p2g_${s}_${body.uuid.slice(0, 8)}`);
                    compute.dispatchOnPass(
                        p2gPass, PIPELINE_IDS.MPM_P2G,
                        [gbg.simParamsForP2G, gbg.gridForP2G, bg.p2g],
                        wg,
                    );
                    p2gPass.end();
                }

                // ── Grid update ───────────────────────────────────────────────
                const wgGrid = Math.ceil(this.gridTotal / 64);
                const gridUpdPass = compute.beginComputePassExplicit(encoder, `mpm_grid_update_${s}`);
                compute.dispatchOnPass(
                    gridUpdPass, PIPELINE_IDS.MPM_GRID_UPDATE,
                    [gbg.simParamsUpdate, gbg.gridForGridUpdate, null!, gbg.collidersForUpdate],
                    wgGrid,
                );
                gridUpdPass.end();

                // ── G2P: para cada corpo ──────────────────────────────────────
                for (const { body } of activeBodies) {
                    const bg = this.bgCache.get(body.uuid)!;
                    const wg = Math.ceil(body.particles.length / 64);
                    const g2pPass = compute.beginComputePassExplicit(encoder, `mpm_g2p_${s}_${body.uuid.slice(0, 8)}`);
                    compute.dispatchOnPass(
                        g2pPass, PIPELINE_IDS.MPM_G2P,
                        [gbg.simParamsForP2G, gbg.gridForG2P, bg.g2p],
                        wg,
                    );
                    g2pPass.end();
                }
            }

            // ── Vertex write (1× por frame, fora do loop substep) ─────────────
            for (const { body, geo } of activeBodies) {
                if (!geo?.vertexBufferId) continue;
                const bg = this.bgCache.get(body.uuid)!;
                if (!bg.vertexWrite || !bg.vertexVbuf) continue;
                const wg = Math.ceil(body.particles.length / 64);
                const vwPass = compute.beginComputePassExplicit(encoder, `mpm_vertex_write_${body.uuid.slice(0, 8)}`);
                compute.dispatchOnPass(
                    vwPass, PIPELINE_IDS.MPM_VERTEX_WRITE,
                    [gbg.simParamsForP2G, null!, bg.vertexWrite, bg.vertexVbuf],
                    wg,
                );
                vwPass.end();
            }

            core.renderPasses.submit([encoder]);
        } catch (err) {
            console.error('[MPMComputePass] encode falhou:', err);
            this.bgCache.clear();
            this.globalBG = null;
        }
    }

    // ── Alocação de buffers por corpo ────────────────────────────────────────

    private allocateBody(mpm: MPMBody): void {
        const buffers = this.core.resources.buffers;
        const n = mpm.particles.length;
        if (n === 0) return;

        const ids = buildMPMBufferIds(mpm.uuid);
        buffers.createStorageBuffer(ids.particlesId, Math.max(n, 1) * MPM_PARTICLE_STRIDE_BYTES);

        const E   = mpm.get<number>('E')    ?? 1e5;
        const nu  = mpm.get<number>('nu')   ?? 0.2;
        const rho = mpm.get<number>('mass') ?? 1.0;

        // Volume de repouso por partícula: volume total da grade / N
        const gridVol    = Math.pow(this.cellSize, 3) * this.gridTotal;
        const volume0    = gridVol / n;
        const massPerP   = rho * volume0;

        const initData = mpm.particles.map(p => ({
            x: p.x, y: p.y, z: p.z,
            vx: p.vx, vy: p.vy, vz: p.vz,
            mass:    massPerP,
            volume0: volume0,
        }));

        const f32 = new Float32Array(n * 32);
        packMPMParticles(initData, f32);
        buffers.writeBuffer(ids.particlesId, f32);

        mpm.bufferIds = ids;
    }

    // ── Buffers globais ───────────────────────────────────────────────────────

    private createGlobalBuffers(): void {
        const buffers = this.core.resources.buffers;
        buffers.createStorageBuffer(MPM_GRID_BUFFER_ID,       this.gridTotal * MPM_GRID_NODE_STRIDE_BYTES);
        buffers.createUniformBuffer(MPM_SIM_PARAMS_BUFFER_ID, MPM_SIM_PARAMS_BYTES);
        this.globalReady = true;
    }

    // ── Construção de bind groups ─────────────────────────────────────────────

    private buildGlobalBindGroups(): MPMGlobalBindGroups | null {
        const compute  = this.core.compute;
        const buffers  = this.core.resources.buffers;

        const simBuf  = buffers.getBuffer(MPM_SIM_PARAMS_BUFFER_ID)?.native;
        const gridBuf = buffers.getBuffer(MPM_GRID_BUFFER_ID)?.native;
        const colBuf  = buffers.getBuffer(COLLIDERS_BUFFER_ID)?.native;
        if (!simBuf || !gridBuf || !colBuf) return null;

        const bg = (id: string, grp: number, entries: GPUBindGroupEntry[], label: string) =>
            compute.createBindGroupFromPipeline(id, grp, entries, label);

        const simParamsForP2G   = bg(PIPELINE_IDS.MPM_P2G,          0, [{ binding: 0, resource: { buffer: simBuf  } }], 'bg_mpm_sim_p2g');
        const gridForP2G        = bg(PIPELINE_IDS.MPM_P2G,          1, [{ binding: 0, resource: { buffer: gridBuf } }], 'bg_mpm_grid_p2g');
        const simParamsUpdate   = bg(PIPELINE_IDS.MPM_GRID_UPDATE,   0, [{ binding: 0, resource: { buffer: simBuf  } }], 'bg_mpm_sim_upd');
        const gridForGridUpdate = bg(PIPELINE_IDS.MPM_GRID_UPDATE,   1, [{ binding: 0, resource: { buffer: gridBuf } }], 'bg_mpm_grid_upd');
        const gridForG2P        = bg(PIPELINE_IDS.MPM_G2P,          1, [{ binding: 0, resource: { buffer: gridBuf } }], 'bg_mpm_grid_g2p');
        const collidersForUpdate = bg(PIPELINE_IDS.MPM_GRID_UPDATE,  3, [{ binding: 0, resource: { buffer: colBuf  } }], 'bg_mpm_colliders');

        return { simParamsForP2G, gridForP2G, simParamsUpdate, gridForGridUpdate, gridForG2P,
                 gridForUpdate: gridForGridUpdate, collidersForUpdate };
    }

    private buildBodyBindGroups(mpm: MPMBody, vertexBufferId?: string): MPMBodyBindGroups {
        const compute = this.core.compute;
        const buffers = this.core.resources.buffers;

        const particlesBuf = buffers.getBuffer(mpm.bufferIds!.particlesId)!.native;

        const bg = (id: string, grp: number, entries: GPUBindGroupEntry[], label: string) =>
            compute.createBindGroupFromPipeline(id, grp, entries, label);

        const p2g = bg(PIPELINE_IDS.MPM_P2G, 2, [{ binding: 0, resource: { buffer: particlesBuf } }], `bg_mpm_p2g_${mpm.uuid.slice(0, 8)}`);
        const g2p = bg(PIPELINE_IDS.MPM_G2P, 2, [{ binding: 0, resource: { buffer: particlesBuf } }], `bg_mpm_g2p_${mpm.uuid.slice(0, 8)}`);

        let vertexWrite: GPUBindGroup | undefined;
        let vertexVbuf: GPUBindGroup | undefined;
        if (vertexBufferId) {
            const vbuf = buffers.getBuffer(vertexBufferId)?.native;
            if (vbuf) {
                vertexWrite = bg(PIPELINE_IDS.MPM_VERTEX_WRITE, 2, [{ binding: 0, resource: { buffer: particlesBuf } }], `bg_mpm_vw_p_${mpm.uuid.slice(0, 8)}`);
                vertexVbuf  = bg(PIPELINE_IDS.MPM_VERTEX_WRITE, 3, [{ binding: 0, resource: { buffer: vbuf          } }], `bg_mpm_vw_vb_${mpm.uuid.slice(0, 8)}`);
            }
        }

        return {
            p2g,
            g2p,
            ...(vertexWrite ? { vertexWrite } : {}),
            ...(vertexVbuf  ? { vertexVbuf  } : {}),
        };
    }

    // ── Init ─────────────────────────────────────────────────────────────────

    private kickInit(): void {
        this.initPromise = ensurePhysicsPipelinesInitialized(this.core)
            .then(() => { this.ready = true; })
            .catch(err => {
                console.error('[MPMComputePass] falha na compilação de pipeline:', err);
                this.initPromise = null;
            });
    }
}
