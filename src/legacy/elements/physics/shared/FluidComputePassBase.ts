/**
 * FluidComputePassBase — classe base para passes de fluidos baseados em partículas.
 *
 * Encapsula a estrutura comum de execute() compartilhada por PBF, SPH, DFSPH, etc.:
 *   collect → writeSimParams → buildBGs → substeps(neighborBuild + encodeSubstep) → submit
 *
 * Subclasses implementam somente a lógica específica de cada algoritmo (~50 linhas):
 *   - writeSimParams  — empacota parâmetros no buffer uniforme
 *   - buildGlobalBGs  — cria bind groups de simParams + neighbors + colliders
 *   - buildBodyBGs    — cria bind groups por corpo
 *   - encodeSubstep   — encoda os dispatches de compute para um corpo em um substep
 *   - allocateBody    — aloca o buffer GPU de partículas do corpo
 *
 * @template TBody     — tipo concreto do corpo físico (PBFBody, SPHBody, …)
 * @template TGlobalBG — tipo dos bind groups globais do passe
 * @template TBodyBG   — tipo dos bind groups por corpo do passe
 */

import { WebGPUEngineCore }        from '../../../core/WebGPUEngineCore';
import type { EngineCore }         from '../../../core/interfaces/EngineCore';
import type { PhysicsComputePass } from '../../../scene/systems/PhysicsComputePass';
import type { GpuSimContext }      from '../../../scene/systems/GpuSimContext';
import type { Force }              from '../../../scene/systems/forces/Force';
import { PhysicsBodyState }        from '../../../scene/core/physics/PhysicsBodyState';
import { ensurePhysicsPipelinesInitialized } from './ShaderLibrary';
import type { NeighborSearchGrid } from './NeighborSearchGrid';

/** Contrato mínimo exigido de qualquer corpo fluido. */
export interface FluidBody {
    readonly uuid:       string;
    readonly physicType: string;
    readonly bodyState:  PhysicsBodyState;
    bufferIds?: { particlesId: string };
    particles:  unknown[];
    get<T>(key: string): T | undefined;
}

export abstract class FluidComputePassBase<
    TBody extends FluidBody,
    TGlobalBG,
    TBodyBG,
> implements PhysicsComputePass {

    // ── Identificação (implementados pelo subclasse via literal) ───────────────
    public abstract readonly passId: string;
    public abstract readonly acceptedPhysicTypes: readonly string[];

    // ── Configuração específica do algoritmo ──────────────────────────────────
    protected abstract readonly simParamsBufferId:  string;
    protected abstract readonly particleStrideFloats: number;

    // ── Estado interno ────────────────────────────────────────────────────────
    protected core: EngineCore = WebGPUEngineCore.getInstance();
    private ready        = false;
    private initPromise: Promise<void> | null = null;
    private globalReady  = false;

    protected readonly bgCache = new Map<string, TBodyBG>();
    protected globalBG: TGlobalBG | null = null;

    protected readonly simParamsF32: Float32Array;
    protected readonly simParamsU32: Uint32Array;
    private   readonly _simParamsBuf: ArrayBuffer;

    constructor(
        protected readonly globalForces: Map<string, Force>,
        protected readonly neighborGrid: NeighborSearchGrid,
        protected readonly substeps:    number,
        protected readonly boundsMin:   [number, number, number],
        simParamsBytesSize: number,
    ) {
        this._simParamsBuf = new ArrayBuffer(simParamsBytesSize);
        this.simParamsF32  = new Float32Array(this._simParamsBuf);
        this.simParamsU32  = new Uint32Array(this._simParamsBuf);
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
        if (buffers.getBuffer(this.simParamsBufferId)) {
            buffers.destroyBuffer(this.simParamsBufferId);
        }
        this.neighborGrid.dispose();
    }

    public execute(context: GpuSimContext, dtFrame: number): void {
        if (!this.ready) { this.kickInit(); return; }
        if (dtFrame <= 0) return;

        if (!this.globalReady) this.initSimParamsBuffer();
        if (!this.globalReady) return;

        const core    = this.core;
        const buffers = core.resources.buffers;

        if (context.colliderBufferRecreated) {
            this.bgCache.clear();
            this.globalBG = null;
        }

        const activeBodies   = this.collectActiveBodies(context);
        if (activeBodies.length === 0) return;

        const totalParticles = activeBodies.reduce((s, b) => s + b.particles.length, 0);
        const dtSub          = dtFrame / this.substeps;

        let gx = 0, gy = 0, gz = 0;
        for (const force of this.globalForces.values()) {
            const f = force.compute(activeBodies[0]! as any, dtSub);
            gx += f[0] ?? 0; gy += f[1] ?? 0; gz += f[2] ?? 0;
        }

        this.writeSimParams(activeBodies, dtFrame, dtSub, totalParticles, context.colliderCount, gx, gy, gz);
        buffers.writeBuffer(this.simParamsBufferId, this.simParamsF32);

        if (!this.globalBG) this.globalBG = this.buildGlobalBGs();
        if (!this.globalBG) return;

        for (const body of activeBodies) {
            if (!this.bgCache.has(body.uuid)) {
                this.bgCache.set(body.uuid, this.buildBodyBGs(body));
            }
        }

        const gbg = this.globalBG;

        try {
            const encoder = core.renderPasses.createCommandEncoder(this.passId + '_gpu');

            for (let s = 0; s < this.substeps; s++) {
                const firstBuf = buffers.getBuffer(activeBodies[0]!.bufferIds!.particlesId)!.native;
                this.neighborGrid.encodeNeighborBuild(encoder, firstBuf, totalParticles, this.particleStrideFloats);

                for (const body of activeBodies) {
                    const bg = this.bgCache.get(body.uuid)!;
                    const wg = Math.ceil(body.particles.length / 64);
                    this.encodeSubstep(encoder, body, gbg, bg, wg, s);
                }
            }

            core.renderPasses.submit([encoder]);
        } catch (err) {
            console.error(`[${this.passId}] encode falhou:`, err);
            this.bgCache.clear();
            this.globalBG = null;
        }
    }

    // ── Métodos abstratos ─────────────────────────────────────────────────────

    /** Aloca o buffer GPU de partículas e popula bufferIds no corpo. */
    protected abstract allocateBody(body: TBody): void;

    /**
     * Empacota os parâmetros de simulação em simParamsF32/U32.
     * Chamado uma vez por frame, antes de writeBuffer.
     */
    protected abstract writeSimParams(
        bodies:         TBody[],
        dtFrame:        number,
        dtSub:          number,
        totalParticles: number,
        colliderCount:  number,
        gx: number, gy: number, gz: number,
    ): void;

    /** Cria bind groups globais (simParams, neighbors, colliders). */
    protected abstract buildGlobalBGs(): TGlobalBG | null;

    /** Cria bind groups específicos de um corpo (particles). */
    protected abstract buildBodyBGs(body: TBody): TBodyBG;

    /**
     * Encoda todos os dispatches de um corpo para um substep.
     * Chamado dentro do loop `for substep → for body`.
     */
    protected abstract encodeSubstep(
        encoder:     GPUCommandEncoder,
        body:        TBody,
        globalBG:    TGlobalBG,
        bodyBG:      TBodyBG,
        workgroups:  number,
        substepIndex: number,
    ): void;

    // ── Helpers protegidos ────────────────────────────────────────────────────

    private collectActiveBodies(context: GpuSimContext): TBody[] {
        const result: TBody[] = [];
        const physType = this.acceptedPhysicTypes[0];
        for (const { body } of context.bodies.values()) {
            if (body.physicType !== physType) continue;
            if (body.bodyState === PhysicsBodyState.Inactive) continue;
            const b = body as unknown as TBody;
            if (!b.bufferIds) this.allocateBody(b);
            if (!b.bufferIds) continue;
            if (b.particles.length === 0) continue;
            result.push(b);
        }
        return result;
    }

    private initSimParamsBuffer(): void {
        this.core.resources.buffers.createUniformBuffer(
            this.simParamsBufferId,
            this._simParamsBuf.byteLength,
        );
        this.globalReady = true;
    }

    private kickInit(): void {
        this.initPromise = ensurePhysicsPipelinesInitialized(this.core)
            .then(() => { this.ready = true; })
            .catch(err => {
                console.error(`[${this.passId}] falha na compilação de pipeline:`, err);
                this.initPromise = null;
            });
    }
}
