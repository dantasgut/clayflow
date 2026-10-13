import type { StructSchema } from '../../descriptors/StructSchema';
import type { Resource } from '../../contracts/Resource';
import type { DrawGroup, EntityEntry, EntityGroupsDeclaration } from '../../flows/slots';
import type { EntityId } from '../../world/EntityId';

/** O que os grupos usam da C2: a lista de instâncias (pool) e a localização de slots (implementado pelo `ResourceSystem`). */
export interface InstanceListHost {
    acquireInstanceList(schema: StructSchema): void;
    releaseInstanceList(schema: StructSchema): void;
    setInstance(poolKey: string, index: number, value: number): void;
    clearInstance(poolKey: string, index: number): void;
    poolKeyOf(resource: Resource, descId: string): string | undefined;
    poolSlotOf(poolKey: string, entityId: EntityId): number | undefined;
}

/** Grupo de instâncias: segmento contíguo da lista, com capacidade em potência de 2. */
interface Group {
    readonly key: string;
    base: number;
    capacity: number;
    readonly members: EntityEntry[];
    /** Valor gravado na lista por membro (mesma ordem de `members`). */
    readonly values: number[];
}

/** Capacidade do primeiro segmento de um grupo. */
const INITIAL_SEGMENT = 4;

/**
 * Grupos de instâncias de um conjunto `entities` (spec 007, research R2), mantidos pela C2 por eventos: inserção,
 * remoção e reavaliação da chave quando um Resource da entidade é enviado. Cada grupo ocupa um segmento contíguo da
 * lista de instâncias (pool `schema.name` da declaração): remoção troca o último para a posição liberada (uma escrita);
 * grupo cheio muda para um segmento com o dobro da capacidade; segmentos livres são reaproveitados por capacidade. As
 * escritas vão ao `ResourceSystem`, que as envia em faixas no `frameRecording`. Com a cena parada nada é percorrido.
 */
export class EntityGroups {
    private readonly groups = new Map<string, Group>();
    private readonly position = new Map<EntityId, { group: Group; index: number }>();
    private readonly freeSegments = new Map<number, number[]>();
    private end = 0;
    private list: readonly DrawGroup[] | null = null;
    private readonly poolKey: string;

    constructor(
        private readonly declaration: EntityGroupsDeclaration,
        private readonly resources: InstanceListHost,
    ) {
        this.poolKey = declaration.schema.name;
        resources.acquireInstanceList(declaration.schema);
    }

    /** Grupos não vazios, em ordem de criação (lista refeita só quando a composição muda). */
    get drawGroups(): readonly DrawGroup[] {
        if (this.list === null) {
            this.list = [...this.groups.values()].map((g) => ({
                key: g.key,
                first: g.base,
                count: g.members.length,
                representative: g.members[0]!,
            }));
        }
        return this.list;
    }

    /** Põe a entrada no grupo da sua chave (sem valor de instância ainda — ex.: registro incompleto —, fica de fora). */
    add(entry: EntityEntry): void {
        if (this.position.has(entry.entityId)) return;
        const value = this.valueOf(entry);
        if (value === undefined) return;
        this.insert(entry, this.declaration.key(entry), value);
    }

    /** Tira a entidade do seu grupo. */
    remove(entityId: EntityId): void {
        const at = this.position.get(entityId);
        if (at === undefined) return;
        this.position.delete(entityId);
        const { group, index } = at;
        const last = group.members.length - 1;
        if (index !== last) {
            const moved = group.members[last]!;
            group.members[index] = moved;
            group.values[index] = group.values[last]!;
            this.position.set(moved.entityId, { group, index });
            this.resources.setInstance(this.poolKey, group.base + index, group.values[index]);
        }
        group.members.pop();
        group.values.pop();
        this.resources.clearInstance(this.poolKey, group.base + last);
        if (group.members.length === 0) {
            this.groups.delete(group.key);
            this.freeSegment(group.base, group.capacity);
        }
        this.list = null;
    }

    /** Reavalia a chave (e o valor) da entrada: muda de grupo se a chave mudou; entra se ainda não estava. */
    rekey(entry: EntityEntry): void {
        const at = this.position.get(entry.entityId);
        if (at === undefined) {
            this.add(entry);
            return;
        }
        const key = this.declaration.key(entry);
        const value = this.valueOf(entry);
        if (key === at.group.key && value === at.group.values[at.index]) return;
        this.remove(entry.entityId);
        if (value !== undefined) this.insert(entry, key, value);
    }

    /** Libera a lista de instâncias. */
    dispose(): void {
        this.groups.clear();
        this.position.clear();
        this.list = null;
        this.resources.releaseInstanceList(this.declaration.schema);
    }

    private insert(entry: EntityEntry, key: string, value: number): void {
        let group = this.groups.get(key);
        if (group === undefined) {
            group = {
                key,
                base: this.allocSegment(INITIAL_SEGMENT),
                capacity: INITIAL_SEGMENT,
                members: [],
                values: [],
            };
            this.groups.set(key, group);
        } else if (group.members.length === group.capacity) {
            this.relocate(group);
        }
        const index = group.members.length;
        group.members.push(entry);
        group.values.push(value);
        this.position.set(entry.entityId, { group, index });
        this.resources.setInstance(this.poolKey, group.base + index, value);
        this.list = null;
    }

    /** Grupo cheio: segmento com o dobro da capacidade; os valores são regravados nas posições novas. */
    private relocate(group: Group): void {
        const oldBase = group.base;
        const oldCapacity = group.capacity;
        group.capacity *= 2;
        group.base = this.allocSegment(group.capacity);
        group.values.forEach((value, i) => {
            this.resources.clearInstance(this.poolKey, oldBase + i);
            this.resources.setInstance(this.poolKey, group.base + i, value);
        });
        this.freeSegment(oldBase, oldCapacity);
    }

    private allocSegment(capacity: number): number {
        const reused = this.freeSegments.get(capacity)?.pop();
        if (reused !== undefined) return reused;
        const base = this.end;
        this.end += capacity;
        return base;
    }

    private freeSegment(base: number, capacity: number): void {
        let list = this.freeSegments.get(capacity);
        if (list === undefined) {
            list = [];
            this.freeSegments.set(capacity, list);
        }
        list.push(base);
    }

    /** Slot do registro do conjunto, ou o slot de pool do descritor nomeado. */
    private valueOf(entry: EntityEntry): number | undefined {
        const instance = this.declaration.instance;
        if (instance === 'record') return entry.recordSlot;
        const [type, descId] = instance;
        const resource = entry.get(type);
        const poolKey = this.resources.poolKeyOf(resource, descId);
        return poolKey === undefined
            ? undefined
            : this.resources.poolSlotOf(poolKey, entry.entityId);
    }
}
