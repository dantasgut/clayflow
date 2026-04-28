import { Entity } from '../../scene/contracts/Entity';
import type { World } from '../../scene/world/World';
import type { EntityId } from '../../scene/world/EntityId';

export class Scene extends Entity {
    constructor(private readonly world: World) {
        super();
    }

    addEntity(entity: Entity): EntityId {
        super.add(entity);
        return this.world.insert(entity);
    }

    removeEntity(entity: Entity): void {
        this.world.remove(entity);
    }
}
