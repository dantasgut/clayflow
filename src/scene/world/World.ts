import type { Entity } from '../contracts/Entity';
import type { Resource } from '../contracts/Resource';
import type { Schema } from '../descriptors/Schema';
import type { EventBus } from '../events/EventBus';
import { asEntityId, type EntityId } from './EntityId';

interface EntityRecord {
    readonly id: EntityId;
    readonly root: Entity;
    readonly resources: Resource[];
    readonly tags: Set<string>;
    readonly schemaNames: Set<string>;
}

/**
 * Inserção que reusaria uma instância já presente numa cena: a refundação proíbe — cada objeto da cena é uma
 * instância própria (dois objetos iguais = duas instâncias com o mesmo conteúdo; o motor deduplica os objetos de
 * GPU por conteúdo).
 */
export class ReuseError extends Error {
    override readonly name = 'ReuseError';
}

/** World vivo onde cada recurso está inserido (só para a mensagem de reuso entre cenas). */
const OWNER_WORLD = new WeakMap<Resource, World>();

/**
 * World é o ECS-like da Camada 2 — registra Entities e indexa seus
 * Resources por schema/tag. Operações principais:
 *   - `insert(entity)`: traverse + atribui EntityId + indexa.
 *   - `query*`: lookup eficiente por schema/tag.
 *   - `remove(entity)`: limpa indexes + emite eventos.
 *
 * Atomicidade: insert/remove emitem `resourcesChanged` e `entitiesRemoved`
 * no EventBus para sistemas reativos (ResourceSystem aloca buffers).
 */
export class World {
    private readonly records = new Map<EntityId, EntityRecord>();
    private readonly entityToId = new Map<Entity, EntityId>();
    private readonly bySchema = new Map<string, Set<EntityId>>();
    private readonly byTag = new Map<string, Set<EntityId>>();
    /** Recurso → entidade raiz que o contém, deste World; limpo no `remove`. */
    private readonly resourceToEntity = new Map<Resource, EntityId>();
    private nextId = 1;

    constructor(private readonly events: EventBus) {}

    /**
     * Insere uma entity raiz (e seus filhos) no World. Coleta todos os
     * Resources da árvore (root + parts), atribui EntityId, indexa por
     * schema, emite `resourcesChanged`.
     *
     * Reuso de instância é proibido: lança `ReuseError` ("instância já inserida — crie outra instância") se a
     * raiz já está inserida, se algum recurso da árvore pertence a outra raiz viva (deste ou de outro World) ou se
     * o mesmo recurso aparece duas vezes na árvore. Depois de `remove`, a mesma instância pode ser inserida de
     * novo.
     */
    insert(entity: Entity): EntityId {
        if (this.entityToId.has(entity)) {
            throw new ReuseError(
                `World: instância já inserida — crie outra instância (${describe(entity)} já está nesta cena).`,
            );
        }
        const resources: Resource[] = [];
        const schemaNames = new Set<string>();
        const tags = new Set<string>();

        this.collectResources(entity, resources, schemaNames);
        const seen = new Set<Resource>();
        for (const r of resources) {
            if (seen.has(r)) {
                throw new ReuseError(
                    `World: instância já inserida — crie outra instância (${describe(r)} aparece duas vezes na árvore).`,
                );
            }
            seen.add(r);
            const owner = OWNER_WORLD.get(r);
            if (owner !== undefined) {
                const where = owner === this ? 'em outra entidade desta cena' : 'em outra cena';
                throw new ReuseError(
                    `World: instância já inserida — crie outra instância (${describe(r)} já está ${where}).`,
                );
            }
        }
        const id = asEntityId(this.nextId++);
        const record: EntityRecord = { id, root: entity, resources, tags, schemaNames };
        this.records.set(id, record);
        this.entityToId.set(entity, id);
        for (const r of resources) {
            this.resourceToEntity.set(r, id);
            OWNER_WORLD.set(r, this);
        }
        for (const name of schemaNames) {
            let set = this.bySchema.get(name);
            if (set === undefined) {
                set = new Set();
                this.bySchema.set(name, set);
            }
            set.add(id);
        }

        this.events.emit('resourcesChanged', { added: resources, removed: [] });
        return id;
    }

    /**
     * Remove a entity do World — limpa indexes (schema, tag), libera
     * EntityId e emite `resourcesChanged` (com `removed`) + `entitiesRemoved`
     * (com `entityIds`). Sistemas reativos liberam recursos GPU.
     */
    remove(entity: Entity): void {
        const id = this.entityToId.get(entity);
        if (id === undefined) return;
        const record = this.records.get(id);
        if (record === undefined) return;

        for (const name of record.schemaNames) {
            this.bySchema.get(name)?.delete(id);
        }
        for (const tag of record.tags) {
            this.byTag.get(tag)?.delete(id);
        }
        this.records.delete(id);
        this.entityToId.delete(entity);
        for (const r of record.resources) {
            this.resourceToEntity.delete(r);
            OWNER_WORLD.delete(r);
        }
        this.events.emit('resourcesChanged', { added: [], removed: record.resources });
        this.events.emit('entitiesRemoved', { entityIds: [id] });
    }

    /**
     * Tags são labels arbitrários associados a entityIds. Útil para queries
     * por gameplay context (e.g. "enemy", "interactive", "bloom-only").
     */
    addTag(id: EntityId, tag: string): void {
        const record = this.records.get(id);
        if (record === undefined) return;
        record.tags.add(tag);
        let set = this.byTag.get(tag);
        if (set === undefined) {
            set = new Set();
            this.byTag.set(tag, set);
        }
        set.add(id);
    }

    /** Lista todos os EntityIds que têm a `tag`. Cópia defensiva — modificável. */
    queryByTag(tag: string): readonly EntityId[] {
        const set = this.byTag.get(tag);
        return set === undefined ? [] : [...set];
    }

    /**
     * Lista todos os EntityIds que contêm um Resource cujo schema tem
     * `name` (e.g. 'Camera', 'BoxVertex', 'RigidBody'). Eficiente — O(1)
     * lookup + O(N) cópia onde N = entities com aquele schema.
     */
    queryBySchemaName(name: string): readonly EntityId[] {
        const set = this.bySchema.get(name);
        return set === undefined ? [] : [...set];
    }

    /** Atalho: queryBySchemaName(schema.name). */
    queryBySchema(schema: Schema): readonly EntityId[] {
        return this.queryBySchemaName(schema.name);
    }

    /**
     * Primeiro Resource do tipo `type` entre as entidades que têm `schema` — consulta de recurso único da cena
     * (ex.: `Time`, campos globais). Reconhece pelo construtor (`instanceof`), que sobrevive à minificação.
     */
    findResource<T extends Resource>(
        schema: Schema,
        type: abstract new (...args: never[]) => T,
    ): T | undefined {
        const ids = this.bySchema.get(schema.name);
        if (ids === undefined) return undefined;
        for (const id of ids) {
            const record = this.records.get(id);
            if (record === undefined) continue;
            for (const r of record.resources) {
                if (r instanceof type) return r;
            }
        }
        return undefined;
    }

    /** Lista os Resources do entityId — root + todos os parts agregados. */
    resourcesOf(id: EntityId): readonly Resource[] {
        const record = this.records.get(id);
        return record === undefined ? [] : record.resources;
    }

    /** Resolve uma Entity para seu EntityId. Undefined se não foi inserida. */
    entityIdOf(entity: Entity): EntityId | undefined {
        return this.entityToId.get(entity);
    }

    /**
     * Mapeia um Resource (mesmo se for `parts` de um root) para o EntityId do root deste World que o contém.
     * `undefined` se o recurso não está inserido neste World (inclusive depois de `remove`).
     */
    entityIdOfResource(resource: Resource): EntityId | undefined {
        return this.resourceToEntity.get(resource);
    }

    /** Resolve um EntityId para a Entity raiz inserida (ou undefined se removida). */
    rootOf(id: EntityId): Entity | undefined {
        return this.records.get(id)?.root;
    }

    /** Iterator sobre todos os records (debugging / introspection). */
    allRecords(): IterableIterator<EntityRecord> {
        return this.records.values();
    }

    private collectResources(entity: Entity, out: Resource[], schemaNames: Set<string>): void {
        if (this.implementsResource(entity)) {
            out.push(entity);
            const ctor = entity.constructor as { schema?: { name: string } };
            if (ctor.schema !== undefined) schemaNames.add(ctor.schema.name);
        }
        for (const part of entity.attached) {
            this.collectResources(part, out, schemaNames);
        }
    }

    private implementsResource(entity: Entity): entity is Entity & Resource {
        const candidate = entity as unknown as {
            getDescriptors?: unknown;
            getPipelineDescriptors?: unknown;
        };
        return (
            typeof candidate.getDescriptors === 'function'
            && typeof candidate.getPipelineDescriptors === 'function'
        );
    }
}

/** Nome legível de uma instância para mensagens de erro (schema do construtor, quando houver). */
function describe(entity: object): string {
    const schema = (entity.constructor as { schema?: { name?: string } }).schema;
    return schema?.name !== undefined ? `'${schema.name}'` : 'a entidade';
}
