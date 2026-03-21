import type { Scene }           from '../core/Scene';
import type { Entity }          from '../core/Entity';
import type { Resource }        from '../core/Resource';
import type { ResourceManager } from '../../core/interfaces/ResourceManager';
import { ResourceState }        from '../core/ResourceState';
import { Loggable }             from '../../core/debug/Loggable';
import { Logger }               from '../../core/debug/Logger';

function isResource(value: unknown): value is Resource {
    return typeof value === 'object' && value !== null && 'state' in value;
}

/**
 * Sistema focado na Camada 2 (Unified ResourceLoader).
 * Itera todas as Entidades da Cena e processa qualquer objeto que implemente
 * o contrato Resource — independente de ser Geometry, Material ou SoftBody.
 */
@Loggable('ResourceLoader')
export class ResourceLoader {
    declare private readonly log: Logger;

    public async load(scene: Scene, resourceManager: ResourceManager): Promise<void> {
        const promises: Promise<void>[] = [];
        const counters = { allocated: 0, updated: 0, disposed: 0 };

        scene.traverse((entity: Entity) => {
            if (!entity.visible) return;

            if (isResource(entity)) {
                this.process(entity, resourceManager, promises, counters);
            }

            for (const component of entity.getComponents()) {
                this.process(component, resourceManager, promises, counters);
            }

            for (const physic of entity.getPhysics()) {
                if (isResource(physic)) {
                    this.process(physic, resourceManager, promises, counters);
                }
            }
        });

        const { allocated, updated, disposed } = counters;

        await Promise.all(promises);
        if (allocated + updated + disposed > 0) {
            this.log.debug(`Recursos processados — alocados:${allocated} atualizados:${updated} descartados:${disposed}`);
        }
    }

    private process(
        resource: Resource,
        resourceManager: ResourceManager,
        promises: Promise<void>[],
        counters: { allocated: number; updated: number; disposed: number },
    ): void {
        const handlers: Partial<Record<ResourceState, () => void | Promise<void>>> = {
            [ResourceState.Uninitialized]: () => { counters.allocated++; return resource.allocateResource?.(resourceManager); },
            [ResourceState.Dirty]:         () => { counters.updated++;   return resource.updateResource?.(resourceManager);   },
            [ResourceState.Disposed]:      () => { counters.disposed++;  return resource.disposeResource?.(resourceManager);  },
        };

        const result = handlers[resource.state as ResourceState]?.();
        if (result instanceof Promise) promises.push(result);
    }
}
