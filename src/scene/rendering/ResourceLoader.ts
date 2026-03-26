import type { Scene }           from '../core/Scene';
import type { Entity }          from '../core/Entity';
import type { Resource }        from '../core/Resource';
import type { ResourceManager } from '../../core/interfaces/ResourceManager';
import { ResourceState }        from '../core/ResourceState';
import { Loggable }             from '../../core/debug/Loggable';
import { Logger }               from '../../core/debug/Logger';
import { SceneLoader }          from './SceneLoader';

function isResource(value: unknown): value is Resource {
    return typeof value === 'object' && value !== null && 'state' in value;
}

/** PhysicsResource são gerenciados exclusivamente pelo PhysicsResourceLoader. */
function isPhysicsResource(value: unknown): boolean {
    return typeof value === 'object' && value !== null &&
           'state' in value && 'physicType' in value && 'dirtyFlags' in value;
}

/**
 * Sistema focado na Camada 2 (Unified ResourceLoader).
 * Itera todas as Entidades da Cena e processa qualquer objeto que implemente
 * o contrato Resource — independente de ser Geometry, Material ou SoftBody.
 *
 * Estende SceneLoader<ResourceManager> — herda o contrato de iteração de cena.
 * Sobrescreve load() para preservar o comportamento assíncrono com Promise.all.
 */
@Loggable('ResourceLoader')
export class ResourceLoader extends SceneLoader<ResourceManager> {
    declare private readonly log: Logger;

    // Contexto de execução acumulado durante um ciclo de load
    private _promises: Promise<void>[] = [];
    private _counters = { allocated: 0, updated: 0, disposed: 0 };
    private _resourceManager!: ResourceManager;

    public override async load(scene: Scene, resourceManager: ResourceManager): Promise<void> {
        this._promises = [];
        this._counters = { allocated: 0, updated: 0, disposed: 0 };
        this._resourceManager = resourceManager;

        scene.traverse((entity: Entity) => {
            if (!entity.visible) return;

            if (isResource(entity)) {
                this._processResource(entity);
            }

            for (const component of entity.getComponents()) {
                this._processResource(component);
            }

            for (const physic of entity.getPhysics()) {
                if (isResource(physic) && !isPhysicsResource(physic)) {
                    this._processResource(physic);
                }
            }
        });

        const { allocated, updated, disposed } = this._counters;

        await Promise.all(this._promises);
        if (allocated + updated + disposed > 0) {
            this.log.debug(`Recursos processados — alocados:${allocated} atualizados:${updated} descartados:${disposed}`);
        }
    }

    /**
     * Implementação obrigatória de SceneLoader.
     * Retorna todos os recursos candidatos de uma entidade (entity + components + physics).
     */
    protected override getResources(entity: Entity): Iterable<unknown> {
        const resources: unknown[] = [];
        if (isResource(entity)) resources.push(entity);
        for (const component of entity.getComponents()) resources.push(component);
        for (const physic of entity.getPhysics()) {
            if (isResource(physic) && !isPhysicsResource(physic)) resources.push(physic);
        }
        return resources;
    }

    /**
     * Implementação obrigatória de SceneLoader.
     * Delega ao método interno tipado — usado por subclasses via super.process().
     */
    protected override process(resource: unknown, _manager: ResourceManager): void {
        if (isResource(resource)) this._processResource(resource);
    }

    private _processResource(
        resource: Resource,
    ): void {
        const rm = this._resourceManager;
        const handlers: Partial<Record<ResourceState, () => void | Promise<void>>> = {
            [ResourceState.Uninitialized]: () => { this._counters.allocated++; return resource.allocateResource?.(rm); },
            [ResourceState.Dirty]:         () => { this._counters.updated++;   return resource.updateResource?.(rm);   },
            [ResourceState.Disposed]:      () => { this._counters.disposed++;  return resource.disposeResource?.(rm);  },
        };

        const result = handlers[resource.state as ResourceState]?.();
        if (result instanceof Promise) this._promises.push(result);
    }
}
