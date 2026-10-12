import { Entity } from '../../scene/contracts/Entity';
import type { World } from '../../scene/world/World';
import type { EntityId } from '../../scene/world/EntityId';

/**
 * Raiz da cena. `add(entity)` e `addEntity(entity)` inserem a entidade no World (visível aos Flows) e a anexam como
 * filha da cena; `add` devolve `this` (encadeável), `addEntity` devolve o `EntityId`. Para anexar um filho a outra
 * entidade (sem inserir), use o `add` dessa entidade (`Entity.add`).
 */
export class Scene extends Entity {
    constructor(private readonly world: World) {
        super();
    }

    /** Insere a entidade no World e a anexa à cena. Encadeável. Reuso de instância lança `ReuseError`. */
    override add(entity: Entity): this {
        this.addEntity(entity);
        return this;
    }

    /**
     * Insere a entidade no World e a anexa à cena; devolve o EntityId atribuído. Reuso de instância lança
     * `ReuseError` e nada é anexado.
     */
    addEntity(entity: Entity): EntityId {
        const id = this.world.insert(entity);
        super.add(entity);
        return id;
    }

    /** Remove a entidade do World (flows param de processá-la no próximo tick). */
    removeEntity(entity: Entity): void {
        this.world.remove(entity);
    }
}
