import { Entity } from '../../scene/contracts/Entity';
import type { World } from '../../scene/world/World';
import type { EntityId } from '../../scene/world/EntityId';

export class Scene extends Entity {
    constructor(private readonly world: World) {
        super();
    }

    /**
     * Insere uma entidade na cena: adiciona como part do Scene (composição) +
     * registra no World (visibilidade para flows). Retorna o EntityId atribuído.
     */
    addEntity(entity: Entity): EntityId {
        super.add(entity);
        return this.world.insert(entity);
    }

    /** Remove a entidade do World (flows param de processá-la no próximo tick). */
    removeEntity(entity: Entity): void {
        this.world.remove(entity);
    }
}
