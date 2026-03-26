import type { Entity }              from '../core/Entity';
import type { PhysicsResource }     from '../core/physics/PhysicsResource';
import type { GpuPipelineEventBus } from '../systems/gpu/GpuPipelineEventBus';
import { ResourceState }            from '../core/ResourceState';
import { PhysicsDirtyFlag }         from '../core/physics/PhysicsDirtyFlag';
import { Loggable }                 from '../../core/debug/Loggable';
import { Logger }                   from '../../core/debug/Logger';
import { SceneLoader }              from './SceneLoader';

function isPhysicsResource(value: unknown): value is PhysicsResource {
    return typeof value === 'object' && value !== null &&
           'state' in value && 'physicType' in value && 'dirtyFlags' in value;
}

/**
 * Loader de ciclo de vida para componentes PhysicsResource.
 * Processa Uninitialized → registro no mundo, Dirty → atualização parcial,
 * Disposed → remoção. Emite eventos coalesced no GpuPipelineEventBus ao final.
 *
 * Camada 2 — sem dependência de WebGPU.
 * Chamado no início de PhysicsWorld.step() antes do framePipeline.
 */
@Loggable('PhysicsResourceLoader')
export class PhysicsResourceLoader<TWorld> extends SceneLoader<TWorld> {
    declare private readonly log: Logger;

    private readonly eventBus: GpuPipelineEventBus;

    // Contadores de coalescing por ciclo de load
    private _uninitializedCount = 0;
    private _disposedCount      = 0;
    private _dirtyColliderFlags = 0; // OR acumulado de flags relevantes a collider
    private _dirtyBodyFlags     = 0; // OR acumulado de flags relevantes a body

    constructor(eventBus: GpuPipelineEventBus) {
        super();
        this.eventBus = eventBus;
    }

    /**
     * Sobrescreve load() para inicializar contadores, percorrer a cena e
     * emitir eventos coalesced ao final do ciclo.
     */
    public override load(scene: { traverse: (cb: (entity: Entity) => void) => void }, world: TWorld): void {
        // Reinicia contadores
        this._uninitializedCount = 0;
        this._disposedCount      = 0;
        this._dirtyColliderFlags = 0;
        this._dirtyBodyFlags     = 0;

        scene.traverse((entity: Entity) => {
            if (!entity.visible) return;
            for (const resource of this.getResources(entity)) {
                this.process(resource, world);
            }
        });

        this._emitCoalescedEvents();
    }

    /**
     * Retorna os componentes físicos da entidade que implementam PhysicsResource.
     */
    protected override getResources(entity: Entity): Iterable<unknown> {
        const result: unknown[] = [];
        for (const physic of entity.getPhysics()) {
            if (isPhysicsResource(physic)) result.push(physic);
        }
        return result;
    }

    /**
     * Processa um PhysicsResource individual — switch por state.
     */
    protected override process(resource: unknown, world: TWorld): void {
        if (!isPhysicsResource(resource)) return;

        switch (resource.state) {
            case ResourceState.Uninitialized: {
                resource.registerInWorld?.(world);
                resource.state      = ResourceState.Ready;
                resource.dirtyFlags = PhysicsDirtyFlag.None;
                this._uninitializedCount++;
                break;
            }
            case ResourceState.Dirty: {
                const flags = resource.dirtyFlags;
                resource.updateInWorld?.(world);
                resource.dirtyFlags = PhysicsDirtyFlag.None;
                resource.state      = ResourceState.Ready;

                // Acumula flags para coalescing — collider: Shape | Material
                if (flags & (PhysicsDirtyFlag.Shape | PhysicsDirtyFlag.Material)) {
                    this._dirtyColliderFlags |= flags;
                }
                // Acumula flags para coalescing — body: Mass | Transform
                if (flags & (PhysicsDirtyFlag.Mass | PhysicsDirtyFlag.Transform)) {
                    this._dirtyBodyFlags |= flags;
                }
                break;
            }
            case ResourceState.Disposed: {
                resource.unregisterFromWorld?.(world);
                resource.state      = ResourceState.Destroyed;
                resource.dirtyFlags = PhysicsDirtyFlag.None;
                this._disposedCount++;
                break;
            }
            default:
                // Ready, Loading, Destroyed, GpuManaged — nenhuma ação
                break;
        }
    }

    // ------------------------------------------------------------------
    // Privado — emissão de eventos coalesced
    // ------------------------------------------------------------------

    private _emitCoalescedEvents(): void {
        const structuralChange = this._uninitializedCount > 0 || this._disposedCount > 0;

        if (structuralChange) {
            const changedCount = this._uninitializedCount + this._disposedCount;
            this.eventBus.emit('physics:bodies:changed',    { changedCount });
            this.eventBus.emit('physics:colliders:changed', { changedCount });
            return; // mudança estrutural já abrange tudo
        }

        if (this._dirtyColliderFlags !== 0) {
            this.eventBus.emit('physics:colliders:changed', { changedCount: 1 });
        }
        if (this._dirtyBodyFlags !== 0) {
            this.eventBus.emit('physics:bodies:changed', { changedCount: 1 });
        }
    }
}
