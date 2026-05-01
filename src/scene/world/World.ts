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

export class World {
    private readonly records = new Map<EntityId, EntityRecord>();
    private readonly entityToId = new Map<Entity, EntityId>();
    private readonly bySchema = new Map<string, Set<EntityId>>();
    private readonly byTag = new Map<string, Set<EntityId>>();
    private nextId = 1;

    constructor(private readonly events: EventBus) {}

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

    queryByTag(tag: string): readonly EntityId[] {
        const set = this.byTag.get(tag);
        return set === undefined ? [] : [...set];
    }

    queryBySchemaName(name: string): readonly EntityId[] {
        const set = this.bySchema.get(name);
        return set === undefined ? [] : [...set];
    }

    queryBySchema(schema: Schema): readonly EntityId[] {
        return this.queryBySchemaName(schema.name);
    }

    resourcesOf(id: EntityId): readonly Resource[] {
        const record = this.records.get(id);
        return record === undefined ? [] : record.resources;
    }

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

    rootOf(id: EntityId): Entity | undefined {
        return this.records.get(id)?.root;
    }

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
