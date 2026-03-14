import type { Scene } from '../core/Scene';
import type { Entity } from '../core/Entity';
import type { Resource } from '../core/Resource';
import type { ResourceManager } from '../../core/interfaces/ResourceManager';
import { ResourceState } from '../core/ResourceState';

/**
 * Sistema focado na Camada 2 (Unified ResourceLoader).
 * Ele itera todas as Entidades da Cena. Se a própria Entidade (ex: RigidBody) for um 
 * Resource alocável, ela será processada. Em seguida, ele itera todos os Componentes 
 * da Entidade (ex: Geometry, Material). Tudo o que veste o contrato Resource envia à Placa.
 */
export class ResourceLoader {
    public async load(scene: Scene, resourceManager: ResourceManager): Promise<void> {
        const promises: Promise<void>[] = [];

        scene.traverse((entity: Entity) => {
            if (!entity.visible) return;

            // 1. Checa se o próprio nó da árvore (Entidade Física) tem contrato de hardware
            const entityAsResource = entity as unknown as Resource;
            if (entityAsResource.allocateResource || entityAsResource.updateResource) {
                this._processResource(entityAsResource, resourceManager, promises);
            }

            // 2. Itera pelos Componentes visuais/lógicos da Entidade
            for (const component of entity.getComponents()) {
                this._processResource(component, resourceManager, promises);
            }
        });

        await Promise.all(promises);
    }

    private _processResource(resource: Resource, resourceManager: ResourceManager, promises: Promise<void>[]): void {
        if (!resource) return;

        // Aloca se estiver cru
        if (resource.state === ResourceState.Uninitialized && resource.allocateResource) {
            const result = resource.allocateResource(resourceManager);
            if (result instanceof Promise) {
                promises.push(result);
            }
        } 
        // Atualiza se estiver sujo
        else if (resource.state === ResourceState.Dirty && resource.updateResource) {
            const result = resource.updateResource(resourceManager);
            if (result instanceof Promise) {
                promises.push(result);
            }
        }
        // Descarta caso descartado
        else if (resource.state === ResourceState.Disposed && resource.disposeResource) {
            resource.disposeResource(resourceManager);
        }
    }
}

