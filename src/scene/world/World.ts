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

const RESOURCE_TO_ENTITY_ID = new WeakMap<Resource, EntityId>();

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
    private nextId = 1;

    constructor(private readonly events: EventBus) {}

    /**
     * Insere uma entity raiz (e seus filhos) no World. Coleta todos os
     * Resources da árvore (root + parts), atribui EntityId, indexa por
     * schema, emite `resourcesChanged`. Idempotente: re-insert da mesma
     * entity retorna o id existente.
     */
    insert(entity: Entity): EntityId {
        if (this.entityToId.has(entity)) {
            const existing = this.entityToId.get(entity);
            if (existing === undefined) throw new Error('World: inconsistent insert state.');
            return existing;
        }
        const id = asEntityId(this.nextId++);
        const resources: Resource[] = [];
        const schemaNames = new Set<string>();
        const tags = new Set<string>();

        this.collectResources(entity, resources, schemaNames);
        const record: EntityRecord = { id, root: entity, resources, tags, schemaNames };
        this.records.set(id, record);
        this.entityToId.set(entity, id);
        for (const r of resources) RESOURCE_TO_ENTITY_ID.set(r, id);
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
     * Mapeia um Resource (mesmo se for `parts` de um root) para o EntityId do
     * root onde ele está alocado. Resources que pertencem a múltiplos roots
     * (não-suportado) retornam o último mapeado.
     */
    entityIdOfResource(resource: Resource): EntityId | undefined {
        return RESOURCE_TO_ENTITY_ID.get(resource);
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
