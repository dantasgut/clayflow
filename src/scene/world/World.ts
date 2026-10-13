import { Entity, WORLD_ENTITY, WORLD_OWNER } from '../contracts/Entity';
import type { Resource } from '../contracts/Resource';
import type { Schema } from '../descriptors/Schema';
import type { EventBus } from '../events/EventBus';
import { asEntityId, type EntityId } from './EntityId';

/** Registro de uma entidade inserida (arrays do tamanho exato; tags só depois da primeira `addTag`). */
interface EntityRecord {
    readonly id: EntityId;
    readonly root: Entity<object>;
    readonly resources: readonly Resource[];
    tags: Set<string> | undefined;
    readonly schemaNames: readonly string[];
}

/**
 * Inserção que reusaria uma instância já presente numa cena: a refundação proíbe — cada objeto da cena é uma
 * instância própria (dois objetos iguais = duas instâncias com o mesmo conteúdo; o motor deduplica os objetos de
 * GPU por conteúdo).
 */
export class ReuseError extends Error {
    /** Nome do erro (`'ReuseError'`). */
    override readonly name = 'ReuseError';
}

/**
 * World vivo e entidade de cada recurso que não herda de `Entity` (os que herdam guardam isso em campos próprios,
 * `WORLD_OWNER`/`WORLD_ENTITY`, sem tabela por recurso — spec 007, um milhão de entidades).
 */
const OWNER_WORLD = new WeakMap<Resource, { readonly world: World; readonly id: EntityId }>();

/** World onde o recurso está inserido, ou `undefined`. */
function worldOf(resource: Resource): unknown {
    return resource instanceof Entity ? resource[WORLD_OWNER] : OWNER_WORLD.get(resource)?.world;
}

function setOwner(resource: Resource, world: World | undefined, id: EntityId | -1): void {
    if (resource instanceof Entity) {
        resource[WORLD_OWNER] = world;
        resource[WORLD_ENTITY] = id;
    } else if (world === undefined) OWNER_WORLD.delete(resource);
    else OWNER_WORLD.set(resource, { world, id: id as EntityId });
}

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
    private readonly entityToId = new Map<Entity<object>, EntityId>();
    private readonly bySchema = new Map<string, Set<EntityId>>();
    private readonly byTag = new Map<string, Set<EntityId>>();
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
    insert(entity: Entity<object>): EntityId {
        if (this.entityToId.has(entity)) {
            throw new ReuseError(
                `World: instância já inserida — crie outra instância (${describe(entity)} já está nesta cena).`,
            );
        }
        const resources: Resource[] = [];
        const names = new Set<string>();

        this.collectResources(entity, resources, names);
        const seen = new Set<Resource>();
        for (const r of resources) {
            if (seen.has(r)) {
                throw new ReuseError(
                    `World: instância já inserida — crie outra instância (${describe(r)} aparece duas vezes na árvore).`,
                );
            }
            seen.add(r);
            const owner = worldOf(r);
            if (owner !== undefined) {
                const where = owner === this ? 'em outra entidade desta cena' : 'em outra cena';
                throw new ReuseError(
                    `World: instância já inserida — crie outra instância (${describe(r)} já está ${where}).`,
                );
            }
        }
        const id = asEntityId(this.nextId++);
        // Cópias do tamanho exato: o registro vive enquanto a entidade estiver na cena (um milhão de entidades, spec 007).
        const schemaNames = [...names];
        const record: EntityRecord = {
            id,
            root: entity,
            resources: resources.slice(),
            tags: undefined,
            schemaNames,
        };
        this.records.set(id, record);
        this.entityToId.set(entity, id);
        for (const r of resources) {
            setOwner(r, this, id);
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
        this.events.emit('entitiesInserted', { entityIds: [id] });
        return id;
    }

    /**
     * Remove a entity do World — limpa indexes (schema, tag), libera
     * EntityId e emite `resourcesChanged` (com `removed`) + `entitiesRemoved`
     * (com `entityIds`). Sistemas reativos liberam recursos GPU.
     */
    remove(entity: Entity<object>): void {
        const id = this.entityToId.get(entity);
        if (id === undefined) return;
        const record = this.records.get(id);
        if (record === undefined) return;

        for (const name of record.schemaNames) {
            this.bySchema.get(name)?.delete(id);
        }
        for (const tag of record.tags ?? []) {
            this.byTag.get(tag)?.delete(id);
        }
        this.records.delete(id);
        this.entityToId.delete(entity);
        for (const r of record.resources) {
            setOwner(r, undefined, -1);
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
        (record.tags ??= new Set()).add(tag);
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
    entityIdOf(entity: Entity<object>): EntityId | undefined {
        return this.entityToId.get(entity);
    }

    /**
     * Mapeia um Resource (mesmo se for `parts` de um root) para o EntityId do root deste World que o contém.
     * `undefined` se o recurso não está inserido neste World (inclusive depois de `remove`).
     */
    entityIdOfResource(resource: Resource): EntityId | undefined {
        if (resource instanceof Entity) {
            return resource[WORLD_OWNER] === this
                ? (resource[WORLD_ENTITY] as EntityId)
                : undefined;
        }
        const owner = OWNER_WORLD.get(resource);
        return owner?.world === this ? owner.id : undefined;
    }

    /** Resolve um EntityId para a Entity raiz inserida (ou undefined se removida). */
    rootOf(id: EntityId): Entity<object> | undefined {
        return this.records.get(id)?.root;
    }

    /** Iterator sobre todos os records (debugging / introspection). */
    allRecords(): IterableIterator<EntityRecord> {
        return this.records.values();
    }

    private collectResources(
        entity: Entity<object>,
        out: Resource[],
        schemaNames: Set<string>,
    ): void {
        if (this.implementsResource(entity)) {
            out.push(entity);
            const ctor = entity.constructor as { schema?: { name: string } };
            if (ctor.schema !== undefined) schemaNames.add(ctor.schema.name);
        }
        for (const part of entity.attached) {
            this.collectResources(part, out, schemaNames);
        }
    }

    private implementsResource(entity: Entity<object>): entity is Entity<object> & Resource {
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
