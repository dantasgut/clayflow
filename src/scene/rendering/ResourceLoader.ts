import type { Scene } from '../core/Scene';
import type { Entity } from '../core/Entity';
import type { Resource } from '../core/Resource';
import type { ResourceManager } from '../../core/interfaces/ResourceManager';
import { ResourceState } from '../core/ResourceState';

function isResource(value: unknown): value is Resource {
    return typeof value === 'object' && value !== null && 'state' in value;
}

/**
 * Sistema focado na Camada 2 (Unified ResourceLoader).
 * Itera todas as Entidades da Cena e processa qualquer objeto que implemente
 * o contrato Resource — independente de ser Geometry, Material ou SoftBody.
 */
export class ResourceLoader {
    public async load(scene: Scene, resourceManager: ResourceManager): Promise<void> {
        const promises: Promise<void>[] = [];

        scene.traverse((entity: Entity) => {
            if (!entity.visible) return;

            // A própria entidade pode implementar Resource (caso raro, ex: aggregate root com alocação própria)
            if (isResource(entity)) {
                this._process(entity, resourceManager, promises);
            }

            // Componentes visuais (Geometry, Material…)
            for (const component of entity.getComponents()) {
                this._process(component, resourceManager, promises);
            }

            // Componentes físicos (RigidBody, SoftBody como Physic…)
            for (const physic of entity.getPhysics()) {
                if (isResource(physic)) {
                    this._process(physic, resourceManager, promises);
                }
            }
        });

        await Promise.all(promises);
    }

    private _process(resource: Resource, resourceManager: ResourceManager, promises: Promise<void>[]): void {
        const handlers: Partial<Record<ResourceState, () => void | Promise<void>>> = {
            [ResourceState.Uninitialized]: () => resource.allocateResource?.(resourceManager),
            [ResourceState.Dirty]:         () => resource.updateResource?.(resourceManager),
            [ResourceState.Disposed]:      () => resource.disposeResource?.(resourceManager),
        };

        const result = handlers[resource.state as ResourceState]?.();
        if (result instanceof Promise) {
            promises.push(result);
        }
    }
}
