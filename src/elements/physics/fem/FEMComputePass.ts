/**
 * FEMComputePass — pipeline GPU XPBD-FEM para corpos deformáveis tetraédricos.
 *
 * Segue o pattern de SoftBodyXPBDComputePass: implementa PhysicsComputePass
 * (não ComputePassBase, que é exclusivo do subsistema de RigidBody).
 *
 * ## Sequência por frame
 *
 * ```
 * Para cada FEMBody com bufferIds alocado:
 *   1. writeSimParams — escreve FEMSimParams no uniform buffer
 *   2. Cria GPUCommandEncoder
 *      Para cada substep:
 *        2a. fem_predict         (ceil(N/64) wg) — integra vel + projeta pred
 *        2b. Para cada cor do graph coloring:
 *              fem_solve         (count_color wg) — resolve C_h + C_d
 *        2c. fem_collision       (ceil(N/64) wg) — corrige pred contra colliders
 *        2d. fem_velocity_update (ceil(N/64) wg) — vel = (pred-pos)/dt; pos = pred
 *      2e. fem_vertex_write      (ceil(N/64) wg) — escreve xyz no vertex buffer
 *   3. submit encoder
 * ```
 *
 * ## Buffers por FEMBody
 *
 *   'gpu_fem_simparams_{uuid}' — uniform FEMSimParams (64 bytes)
 *   'gpu_fem_nodes_{uuid}'     — storage Particle[] (N × 48 bytes)
 *   'gpu_fem_elements_{uuid}'  — storage FEMElement[] (E × 112 bytes)
 *   'gpu_fem_color_range_{uuid}_{c}' — uniform ColorRange (16 bytes) por cor c
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
import type { FEMBody }                from '../FEMBody';
import {
    FEM_SIM_PARAMS_BYTES,
    buildFEMBufferIds,
    buildFEMColorRangeId,
    packFEMNodes,
    packFEMElements,
    packFEMColorRange,
    type FEMBufferIds,
    FEM_NODE_STRIDE_BYTES,
    FEM_ELEM_STRIDE_BYTES,
    FEM_COLOR_RANGE_BYTES,
} from './FEMBufferLayout';
import {
    graphColorFEMElements,
    type FEMColorRange,
} from './FEMGraphColorSolver';
import {
    FSP_GRAVITY_X, FSP_GRAVITY_Y, FSP_GRAVITY_Z,
    FSP_DT_SUB, FSP_MU, FSP_LAMBDA, FSP_DAMPING,
    FSP_COLLISION_RADIUS, FSP_ALPHA_H, FSP_ALPHA_D,
    FSP_DT_FRAME, FSP_RESTITUTION,
    FSP_COLLIDER_COUNT, FSP_NODE_COUNT, FSP_ELEM_COUNT, FSP_SOLVE_ITERS,
} from './FEMSimParamsLayout';

type FEMBodyBindGroups = {
    predict:        GPUBindGroup;
    solveColor:     GPUBindGroup[];   // one per color
    collision:      GPUBindGroup;
    velocityUpdate: GPUBindGroup;
    vertexWrite:    GPUBindGroup;
    colorRanges:    GPUBindGroup[];   // ColorRange uniforms for group(1)
    colorCounts:    number[];
};

export class FEMComputePass implements PhysicsComputePass {

    public readonly passId = 'XPBDFEMBody';
    public readonly acceptedPhysicTypes: readonly string[] = ['FEMBody'];

    private core: EngineCore = WebGPUEngineCore.getInstance();
    private ready        = false;
    private initPromise: Promise<void> | null = null;

    /** Bind groups cacheados por uuid do FEMBody. */
    private readonly bgCache = new Map<string, FEMBodyBindGroups>();

    private readonly simParamsBuf = new ArrayBuffer(FEM_SIM_PARAMS_BYTES);
    private readonly simParamsF32 = new Float32Array(this.simParamsBuf);
    private readonly simParamsU32 = new Uint32Array(this.simParamsBuf);

    constructor(
        private readonly globalForces:  Map<string, Force>,
        private readonly getSubsteps:   () => number,
        private readonly solveIters:    number = 10,
    ) {}

    // ── PhysicsComputePass ────────────────────────────────────────────────────

    public ensureReady(core: EngineCore): Promise<void> {
        this.core = core;
        if (!this.initPromise) this.kickInit();
        return this.initPromise ?? Promise.resolve();
    }

    public dispose(): void {
        this.bgCache.clear();
    }

    public execute(context: GpuSimContext, dtFrame: number): void {
        if (!this.ready) {
            this.kickInit();
            return;
        }
        if (dtFrame <= 0) return;

        const substeps = this.getSubsteps();
        const dtSub    = dtFrame / substeps;
        const core     = this.core;
        const compute  = core.compute;
        const buffers  = core.resources.buffers;
        const colliderCount = context.colliderCount;

        if (context.colliderBufferRecreated) {
            this.bgCache.clear();
        }

        const encoders: GPUCommandEncoder[] = [];

        for (const { body, entity } of context.bodies.values()) {
            if (body.physicType !== 'FEMBody') continue;
            if (body.bodyState === PhysicsBodyState.Inactive) continue;

            const fem = body as unknown as FEMBody;
            if (!fem.bufferIds) {
                this.allocateBody(fem);
            }
            const ids = fem.bufferIds;
            if (!ids) continue;

            const geo = entity.getComponent<Geometry>('Geometry');
            if (!geo) continue;
            if (!geo.vertexBufferId) continue;

            const nCount = fem.nodes.length;
            const eCount = fem.elements.length;
            if (nCount === 0 || eCount === 0) continue;

            if (!geo.currentResourceState.suppressCpuUpload() && geo.currentResourceState.canRender()) {
                geo.enterGpuManagedMode();
            }

            const mu     = body.get<number>('mu')              ?? 1e4;
            const lambda = body.get<number>('lambda')          ?? 1e4;
            const damp   = body.get<number>('damping')         ?? 0.01;
            const cRad   = body.get<number>('collisionRadius') ?? 0.0;
            const rest   = body.get<number>('restitution')     ?? 0.0;
            const alphaH = 1 / (lambda + 2 * mu);
            const alphaD = mu > 0 ? 1 / mu : 1e8;

            let gx = 0, gy = 0, gz = 0;
            for (const force of this.globalForces.values()) {
                const f = force.compute(body, dtSub);
                gx += f[0] ?? 0;
                gy += f[1] ?? 0;
                gz += f[2] ?? 0;
            }

            this.simParamsF32[FSP_GRAVITY_X]        = gx;
            this.simParamsF32[FSP_GRAVITY_Y]        = gy;
            this.simParamsF32[FSP_GRAVITY_Z]        = gz;
            this.simParamsF32[FSP_DT_SUB]           = dtSub;
            this.simParamsF32[FSP_MU]               = mu;
            this.simParamsF32[FSP_LAMBDA]           = lambda;
            this.simParamsF32[FSP_DAMPING]          = damp;
            this.simParamsF32[FSP_COLLISION_RADIUS] = cRad;
            this.simParamsF32[FSP_ALPHA_H]          = alphaH;
            this.simParamsF32[FSP_ALPHA_D]          = alphaD;
            this.simParamsF32[FSP_DT_FRAME]         = dtFrame;
            this.simParamsF32[FSP_RESTITUTION]      = rest;
            this.simParamsU32[FSP_COLLIDER_COUNT]   = colliderCount;
            this.simParamsU32[FSP_NODE_COUNT]        = nCount;
            this.simParamsU32[FSP_ELEM_COUNT]        = eCount;
            this.simParamsU32[FSP_SOLVE_ITERS]       = this.solveIters;
            buffers.writeBuffer(ids.simParamsId, this.simParamsF32);

            let bg = this.bgCache.get(fem.uuid);
            if (!bg) {
                bg = this.buildBindGroups(fem, ids, geo.vertexBufferId, colliderCount);
                this.bgCache.set(fem.uuid, bg);
            }

            const wgNodes = Math.ceil(nCount / 64);

            try {
                const encoder = core.renderPasses.createCommandEncoder(`fem_gpu_${fem.uuid}`);

                for (let s = 0; s < substeps; s++) {
                    // fem_predict
                    const predictPass = compute.beginComputePassExplicit(encoder, `fem_predict_${s}`);
                    compute.dispatchOnPass(predictPass, PIPELINE_IDS.FEM_PREDICT, [bg.predict], wgNodes);
                    predictPass.end();

                    // fem_solve — uma passada por cor do graph coloring
                    for (let c = 0; c < bg.colorCounts.length; c++) {
                        const wgColor = bg.colorCounts[c]!;
                        if (wgColor === 0) continue;
                        const solvePass = compute.beginComputePassExplicit(encoder, `fem_solve_${s}_c${c}`);
                        compute.dispatchOnPass(
                            solvePass,
                            PIPELINE_IDS.FEM_SOLVE,
                            [bg.solveColor[c]!, bg.colorRanges[c]!],
                            wgColor,
                        );
                        solvePass.end();
                    }

                    // fem_collision
                    const collisionPass = compute.beginComputePassExplicit(encoder, `fem_collision_${s}`);
                    compute.dispatchOnPass(collisionPass, PIPELINE_IDS.FEM_COLLISION, [bg.collision], wgNodes);
                    collisionPass.end();

                    // fem_velocity_update
                    const velPass = compute.beginComputePassExplicit(encoder, `fem_vel_update_${s}`);
                    compute.dispatchOnPass(velPass, PIPELINE_IDS.FEM_VELOCITY_UPDATE, [bg.velocityUpdate], wgNodes);
                    velPass.end();
                }

                // fem_vertex_write — 1× por frame
                const writePass = compute.beginComputePassExplicit(encoder, 'fem_vertex_write');
                compute.dispatchOnPass(writePass, PIPELINE_IDS.FEM_VERTEX_WRITE, [bg.vertexWrite], wgNodes);
                writePass.end();

                encoders.push(encoder);
            } catch (err) {
                console.error(`[FEMComputePass] encode falhou para corpo ${fem.uuid}:`, err);
                this.bgCache.delete(fem.uuid);
            }
        }

        if (encoders.length > 0) {
            core.renderPasses.submit(encoders);
        }
    }

    // ── Alocação de buffers por corpo ────────────────────────────────────────

    private allocateBody(fem: FEMBody): void {
        const buffers = this.core.resources.buffers;
        const uuid    = fem.uuid;

        const ids = buildFEMBufferIds(uuid);

        buffers.createUniformBuffer(ids.simParamsId,  FEM_SIM_PARAMS_BYTES);
        buffers.createStorageBuffer(ids.nodesId,    Math.max(fem.nodes.length, 1)    * FEM_NODE_STRIDE_BYTES);
        buffers.createStorageBuffer(ids.elementsId, Math.max(fem.elements.length, 1) * FEM_ELEM_STRIDE_BYTES);

        // Serializa nós e elementos
        if (fem.nodes.length > 0) {
            const nodeF32 = new Float32Array(fem.nodes.length * 12);
            packFEMNodes(fem.nodes.map(n => ({
                x: n.x, y: n.y, z: n.z,
                vx: n.vx, vy: n.vy, vz: n.vz,
                invMass: n.w > 0 ? (fem.nodes.length / (fem.get<number>('mass') ?? 1)) : 0,
            })), nodeF32);
            buffers.writeBuffer(ids.nodesId, nodeF32);
        }

        if (fem.elements.length > 0) {
            const elemAB = new ArrayBuffer(fem.elements.length * FEM_ELEM_STRIDE_BYTES);
            const elemF32 = new Float32Array(elemAB);
            const elemU32 = new Uint32Array(elemAB);
            const mu     = fem.get<number>('mu')     ?? 1e4;
            const lambda = fem.get<number>('lambda') ?? 1e4;

            // Pré-computa D_m_inv para cada elemento
            const elemData = fem.elements.map(e => {
                const p0 = fem.nodes[e.n0]!;
                const p1 = fem.nodes[e.n1]!;
                const p2 = fem.nodes[e.n2]!;
                const p3 = fem.nodes[e.n3]!;
                const { Bm_inv, restVolume } = computeDmInv(p0, p1, p2, p3);
                return {
                    n0: e.n0, n1: e.n1, n2: e.n2, n3: e.n3,
                    Bm_col0: Bm_inv[0] as [number, number, number],
                    Bm_col1: Bm_inv[1] as [number, number, number],
                    Bm_col2: Bm_inv[2] as [number, number, number],
                    restVolume,
                    mu,
                    lambda,
                };
            });
            packFEMElements(elemData, elemF32, elemU32);
            buffers.writeBuffer(ids.elementsId, elemF32);

            // Graph coloring
            const colorResult = graphColorFEMElements(fem.elements, fem.nodes.length);

            // Reordena elementos segundo sortedIndices
            const reorderedAB   = new ArrayBuffer(fem.elements.length * FEM_ELEM_STRIDE_BYTES);
            const reorderedF32  = new Float32Array(reorderedAB);
            const reorderedU32  = new Uint32Array(reorderedAB);
            const srcStride = 28; // words per element
            for (let k = 0; k < colorResult.sortedIndices.length; k++) {
                const srcIdx = colorResult.sortedIndices[k]!;
                const dstBase = k * srcStride;
                const srcBase = srcIdx * srcStride;
                for (let w = 0; w < srcStride; w++) {
                    reorderedU32[dstBase + w] = elemU32[srcBase + w]!;
                    reorderedF32[dstBase + w] = elemF32[srcBase + w]!;
                }
            }
            buffers.writeBuffer(ids.elementsId, reorderedF32);

            // Cria buffers de ColorRange
            for (let c = 0; c < colorResult.colorRanges.length; c++) {
                const range = colorResult.colorRanges[c]!;
                const rangeId = buildFEMColorRangeId(uuid, c);
                ids.colorRangeIds.push(rangeId);
                ids.colorCounts.push(range.count);
                const u32 = new Uint32Array(4);
                packFEMColorRange(range.offset, range.count, u32);
                buffers.createUniformBuffer(rangeId, FEM_COLOR_RANGE_BYTES);
                buffers.writeBuffer(rangeId, u32);
            }
        }

        fem.bufferIds = ids;
    }

    // ── Construção de bind groups ─────────────────────────────────────────────

    private buildBindGroups(
        _fem:           FEMBody,
        ids:            FEMBufferIds,
        vertexBufferId: string,
        _colliderCount: number,
    ): FEMBodyBindGroups {
        const compute  = this.core.compute;
        const buffers  = this.core.resources.buffers;

        const simBuf       = buffers.getBuffer(ids.simParamsId)!.native;
        const nodesBuf     = buffers.getBuffer(ids.nodesId)!.native;
        const elemsBuf     = buffers.getBuffer(ids.elementsId)!.native;
        const collidersBuf = buffers.getBuffer(COLLIDERS_BUFFER_ID)!.native;
        const vbuf         = buffers.getBuffer(vertexBufferId)!.native;

        const bg = (id: string, grp: number, entries: GPUBindGroupEntry[], label: string) =>
            compute.createBindGroupFromPipeline(id, grp, entries, label);

        const predict = bg(PIPELINE_IDS.FEM_PREDICT, 0, [
            { binding: 0, resource: { buffer: simBuf   } },
            { binding: 1, resource: { buffer: nodesBuf } },
        ], 'bg_fem_predict');

        const collision = bg(PIPELINE_IDS.FEM_COLLISION, 0, [
            { binding: 0, resource: { buffer: simBuf       } },
            { binding: 1, resource: { buffer: nodesBuf     } },
            { binding: 2, resource: { buffer: collidersBuf } },
        ], 'bg_fem_collision');

        const velocityUpdate = bg(PIPELINE_IDS.FEM_VELOCITY_UPDATE, 0, [
            { binding: 0, resource: { buffer: simBuf   } },
            { binding: 1, resource: { buffer: nodesBuf } },
        ], 'bg_fem_vel_update');

        const vertexWrite = bg(PIPELINE_IDS.FEM_VERTEX_WRITE, 0, [
            { binding: 0, resource: { buffer: simBuf   } },
            { binding: 1, resource: { buffer: nodesBuf } },
            { binding: 2, resource: { buffer: vbuf     } },
        ], 'bg_fem_vertex_write');

        // solve bind groups: group(0) é igual para todas as cores (sim+nodes+elems)
        // group(1) varia por cor (ColorRange uniform)
        const solveColor: GPUBindGroup[] = [];
        const colorRanges: GPUBindGroup[] = [];

        const solveGroup0 = bg(PIPELINE_IDS.FEM_SOLVE, 0, [
            { binding: 0, resource: { buffer: simBuf   } },
            { binding: 1, resource: { buffer: nodesBuf } },
            { binding: 2, resource: { buffer: elemsBuf } },
        ], 'bg_fem_solve_g0');

        for (let c = 0; c < ids.colorRangeIds.length; c++) {
            solveColor.push(solveGroup0);   // same group(0) for all colors
            const rangeBuf = buffers.getBuffer(ids.colorRangeIds[c]!)!.native;
            colorRanges.push(bg(PIPELINE_IDS.FEM_SOLVE, 1, [
                { binding: 0, resource: { buffer: rangeBuf } },
            ], `bg_fem_solve_color_${c}`));
        }

        return {
            predict,
            solveColor,
            collision,
            velocityUpdate,
            vertexWrite,
            colorRanges,
            colorCounts: [...ids.colorCounts],
        };
    }

    // ── Init ─────────────────────────────────────────────────────────────────

    private kickInit(): void {
        this.initPromise = ensurePhysicsPipelinesInitialized(this.core)
            .then(() => { this.ready = true; })
            .catch(err => {
                console.error('[FEMComputePass] falha na compilação de pipeline:', err);
                this.initPromise = null;
            });
    }
}

// ── Helpers CPU — pré-computa D_m_inv e volume de repouso ────────────────────

interface FEMNodePos { x: number; y: number; z: number; }

function computeDmInv(
    p0: FEMNodePos, p1: FEMNodePos, p2: FEMNodePos, p3: FEMNodePos,
): { Bm_inv: [[number, number, number], [number, number, number], [number, number, number]]; restVolume: number } {
    // D_m colunas: [p1-p0 | p2-p0 | p3-p0]
    const c0: [number, number, number] = [p1.x - p0.x, p1.y - p0.y, p1.z - p0.z];
    const c1: [number, number, number] = [p2.x - p0.x, p2.y - p0.y, p2.z - p0.z];
    const c2: [number, number, number] = [p3.x - p0.x, p3.y - p0.y, p3.z - p0.z];

    const det = c0[0] * (c1[1] * c2[2] - c2[1] * c1[2])
              - c1[0] * (c0[1] * c2[2] - c2[1] * c0[2])
              + c2[0] * (c0[1] * c1[2] - c1[1] * c0[2]);

    const restVolume = Math.abs(det) / 6;

    if (Math.abs(det) < 1e-12) {
        // Degenerate element — return identity
        return {
            Bm_inv: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
            restVolume: 0,
        };
    }

    const inv = 1 / det;
    // Adjugada / det = inversa
    const i00 =  (c1[1] * c2[2] - c2[1] * c1[2]) * inv;
    const i10 = -(c1[0] * c2[2] - c2[0] * c1[2]) * inv;
    const i20 =  (c1[0] * c2[1] - c2[0] * c1[1]) * inv;
    const i01 = -(c0[1] * c2[2] - c2[1] * c0[2]) * inv;
    const i11 =  (c0[0] * c2[2] - c2[0] * c0[2]) * inv;
    const i21 = -(c0[0] * c2[1] - c2[0] * c0[1]) * inv;
    const i02 =  (c0[1] * c1[2] - c1[1] * c0[2]) * inv;
    const i12 = -(c0[0] * c1[2] - c1[0] * c0[2]) * inv;
    const i22 =  (c0[0] * c1[1] - c1[0] * c0[1]) * inv;

    return {
        Bm_inv: [
            [i00, i01, i02],  // coluna 0
            [i10, i11, i12],  // coluna 1
            [i20, i21, i22],  // coluna 2
        ],
        restVolume,
    };
}
