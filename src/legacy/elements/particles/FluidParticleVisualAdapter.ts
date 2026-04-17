/**
 * FluidParticleVisualAdapter — bridge entre simulação de fluido GPU e renderer. (Camada 3)
 *
 * Conecta PBFBody/SPHBody ao sistema de renderização de partículas da engine,
 * reutilizando o pipeline `ParticleExtractionStrategy` existente sem criar
 * nenhuma nova infraestrutura de renderização.
 *
 * Estratégia: lê posições **diretamente** do buffer GPU da simulação (zero-copy).
 * Nenhum staging, nenhuma cópia CPU↔GPU — o buffer de física IS o buffer de render.
 *
 * ## Timing de alocação
 *
 * O buffer GPU de partículas é alocado pelo PhysicsComputePass durante o primeiro
 * `execute()` (passo 5a do renderer). O adapter detecta isso via `updateResource()`
 * (passo 2 — ResourceLoader), que é chamado a cada frame enquanto o estado for Dirty.
 * Na prática: partículas aparecem no frame seguinte ao primeiro substep de física.
 *
 * ## Uso
 *
 * ```typescript
 * const sph = new SPHBody({ smoothingRadius: 0.1 });
 * sph.particles = [...];
 * const adapter = new FluidParticleVisualAdapter(sph);
 * entity.add(sph);
 * entity.add(adapter);           // ResourceLoader cuida do ciclo de vida
 * // renderer precisar ter o shader registrado:
 * renderer.registerShader(FLUID_PARTICLE_SHADER_ID, FLUID_PARTICLE_WGSL);
 * ```
 *
 * @example
 * ```typescript
 * import { FluidParticleVisualAdapter, FLUID_PARTICLE_SHADER_ID, FLUID_PARTICLE_WGSL }
 *   from '@clayengine/engine';
 *
 * renderer.registerShader(FLUID_PARTICLE_SHADER_ID, FLUID_PARTICLE_WGSL);
 * const adapter = new FluidParticleVisualAdapter(pbfBody);
 * entity.add(adapter);
 * ```
 */

import { ParticleEmitter }        from '../../scene/components/particles/ParticleEmitter';
import type { ResourceManager }   from '../../core/interfaces/ResourceManager';
import { ResourceState }          from '../../scene/core/ResourceState';
import { FLUID_PARTICLE_SHADER_ID } from '../../presentation/shaders/FluidParticleShader';

/** Contrato mínimo para corpos fluidos que expõem bufferIds. */
interface FluidPhysicsBody {
    readonly uuid: string;
    bufferIds?: { particlesId: string };
    particles:  unknown[];
}

export class FluidParticleVisualAdapter extends ParticleEmitter {

    public override readonly maxParticles: number;

    private readonly _physicsBody: FluidPhysicsBody;
    private _rm: ResourceManager | null = null;
    private _renderBgId = '';

    constructor(physicsBody: FluidPhysicsBody) {
        super();
        this._physicsBody = physicsBody;
        this.maxParticles = physicsBody.particles.length;
        this.shaderId     = FLUID_PARTICLE_SHADER_ID;

        // Bind group layout: storage buffer (partículas)
        this.bindGroupSchema = [{
            binding:    0,
            visibility: GPUShaderStage.VERTEX,
            buffer:     { type: 'read-only-storage' as GPUBufferBindingType },
        }];
    }

    // ── Template Method (ParticleEmitter) ─────────────────────────────────────

    protected async doAllocate(rm: ResourceManager): Promise<void> {
        this._rm = rm;
        // Registra o layout do bind group agora que o ResourceManager está disponível
        rm.bindings.getLayout(this.shaderId, this.bindGroupSchema);
        // Tenta criar o bind group se o buffer de física já existe (re-render / hot-reload)
        this._tryCreateBindGroup(rm);
    }

    protected async doUpdate(rm: ResourceManager): Promise<void> {
        this._rm = rm;
        this._tryCreateBindGroup(rm);
        if (this.bindGroupIds.length > 0) {
            this.aliveCount = this._physicsBody.particles.length;
        }
    }

    protected doDispose(rm: ResourceManager): void {
        if (this._renderBgId) {
            rm.bindings.destroyBindGroup(this._renderBgId, this.shaderId);
            this._renderBgId = '';
        }
        this._rm = null;
    }

    /**
     * Partículas fluidas não emitem: a simulação GPU é responsável pelo movimento.
     * aliveCount é atualizado via updateResource().
     */
    public step(_encoder: GPUCommandEncoder, _dt: number): void {
        // no-op: física GPU atualiza o buffer diretamente
    }

    // ── Lifecycle override ────────────────────────────────────────────────────

    /**
     * Sobrescreve para manter estado Dirty até que o buffer de física exista.
     * Quando o bind group é criado com sucesso, transita para Ready automaticamente.
     */
    public override async allocateResource(rm: ResourceManager): Promise<void> {
        this.state = ResourceState.Loading;
        await this.doAllocate(rm);
        // Se o bind group foi criado, pronto; senão fica Dirty para tentar novamente.
        this.state = this.bindGroupIds.length > 0 ? ResourceState.Ready : ResourceState.Dirty;
    }

    public override async updateResource(rm: ResourceManager): Promise<void> {
        await this.doUpdate(rm);
        // Idem: pronto só quando bind group criado.
        this.state = this.bindGroupIds.length > 0 ? ResourceState.Ready : ResourceState.Dirty;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Tenta criar o bind group de render apontando para o buffer GPU de física.
     * Retorna true se bem-sucedido.
     */
    private _tryCreateBindGroup(rm: ResourceManager): boolean {
        if (this.bindGroupIds.length > 0) return true;   // já criado

        const physBufId = this._physicsBody.bufferIds?.particlesId;
        if (!physBufId) return false;                     // physics pass ainda não rodou

        const physBuf = rm.buffers.getBuffer(physBufId)?.native;
        if (!physBuf) return false;

        const bgId = `fluid_ptcl_bg_${this.uuid}`;
        const bg   = rm.bindings.getBindGroup(bgId, this.shaderId, [
            { binding: 0, resource: { buffer: physBuf } },
        ]);
        this._renderBgId  = bgId;
        this.bindGroupIds = [bg.id];
        this.aliveCount   = this._physicsBody.particles.length;
        return true;
    }
}
