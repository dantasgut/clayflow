import type { Component } from '../../core/Component';
import type { ResourceManager } from '../../../core/interfaces/ResourceManager';
import { ResourceState } from '../../core/ResourceState';
import { ResourceType } from '../../core/ResourceType';
import type { ResourceStateHandler } from '../../core/resource/ResourceStateHandler';
import { ResourceStateHandlerRegistry } from '../../core/resource/ResourceStateHandlerRegistry';

/**
 * Componente abstrato de emissor de partículas. (Camada 2)
 *
 * Template Method selado: subclasses implementam `doAllocate`, `doUpdate`, `doDispose` e `step`.
 * Property Bag herdado: configurações arbitrárias legíveis por estratégias externas.
 *
 * Renderização via instanced draw — o vertex shader usa `@builtin(instance_index)`
 * para ler posição/vida diretamente do buffer de partículas (storage buffer).
 * Não usa Geometry convencional.
 *
 * @example
 * const emitter = new CPUParticleEmitter({ maxParticles: 500 });
 * entity.add(emitter);
 */
export abstract class ParticleEmitter implements Component {
    private static nextUuid = 0;
    public readonly uuid: string = `emitter_${++ParticleEmitter.nextUuid}`;

    public readonly layer = ResourceType.VISUAL_COMPONENT;
    public readonly type  = 'ParticleEmitter';
    public state: ResourceState = ResourceState.Uninitialized;

    /** Handler do estado atual — encapsula capacidades do ciclo de vida GPU. */
    public get currentResourceState(): ResourceStateHandler {
        return ResourceStateHandlerRegistry.get(this.state);
    }

    // Property Bag — configuração aberta para qualquer domínio
    private readonly props = new Map<string, unknown>();
    public set<T>(key: string, value: T): this { this.props.set(key, value); return this; }
    public get<T>(key: string): T | undefined { return this.props.get(key) as T | undefined; }

    /** Número máximo de partículas simultâneas alocadas no buffer GPU. */
    public abstract readonly maxParticles: number;

    /** Partículas vivas neste frame — atualizado por `step()`. */
    public aliveCount: number = 0;

    /** ID do shader pipeline para renderização das partículas. */
    public shaderId: string = 'particle';

    /** Bind groups fornecidos ao render pass (inclui o buffer de partículas). */
    public bindGroupIds: string[] = [];

    /** Schema do bind group de renderização (para registro no BindGroupManager). */
    public bindGroupSchema: GPUBindGroupLayoutEntry[] = [];

    // Template Method — lifecycle selado
    public async allocateResource(rm: ResourceManager): Promise<void> {
        this.state = ResourceState.Loading;
        await this.doAllocate(rm);
        this.state = ResourceState.Ready;
    }

    public async updateResource(rm: ResourceManager): Promise<void> {
        await this.doUpdate(rm);
        this.state = ResourceState.Ready;
    }

    public disposeResource(rm: ResourceManager): void {
        this.doDispose(rm);
        this.bindGroupIds = [];
        this.state = ResourceState.Destroyed;
    }

    public markDirty(): void {
        if (this.currentResourceState.ignoreDirtyMark()) return;
        this.state = ResourceState.Dirty;
    }

    /** Avança a simulação: spawn + integração. Chamado por ParticleSystem.step(). */
    public abstract step(encoder: GPUCommandEncoder, dt: number): void;

    protected abstract doAllocate(rm: ResourceManager): Promise<void>;
    protected abstract doUpdate(rm: ResourceManager): Promise<void>;
    protected abstract doDispose(rm: ResourceManager): void;
}
