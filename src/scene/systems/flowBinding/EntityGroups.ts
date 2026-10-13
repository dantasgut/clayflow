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

/**
 * Entrada de conjunto com a sua posição no grupo guardada nela mesma (sem tabela por entidade — spec 007, US7). Cada
 * entrada pertence a um conjunto só, e cada conjunto tem no máximo um `EntityGroups`.
 */
export interface GroupMember extends EntityEntry {
    /** Grupo atual (interno do `EntityGroups`); `undefined` fora de grupo. */
    groupOf: object | undefined;
    /** Posição no grupo. */
    groupIndex: number;
}

/** Grupo de instâncias: segmento contíguo da lista, com capacidade em potência de 2. */
interface Group {
    readonly key: string;
    base: number;
    capacity: number;
    readonly members: GroupMember[];
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
    add(entry: GroupMember): void {
        if (entry.groupOf !== undefined) return;
        const value = this.valueOf(entry);
        if (value === undefined) return;
        this.insert(entry, this.declaration.key(entry), value);
    }

    /** Tira a entrada do seu grupo. */
    remove(entry: GroupMember): void {
        const group = entry.groupOf as Group | undefined;
        if (group === undefined) return;
        const index = entry.groupIndex;
        entry.groupOf = undefined;
        entry.groupIndex = -1;
        const last = group.members.length - 1;
        if (index !== last) {
            const moved = group.members[last]!;
            group.members[index] = moved;
            group.values[index] = group.values[last]!;
            moved.groupIndex = index;
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
    rekey(entry: GroupMember): void {
        const group = entry.groupOf as Group | undefined;
        if (group === undefined) {
            this.add(entry);
            return;
        }
        const key = this.declaration.key(entry);
        const value = this.valueOf(entry);
        if (key === group.key && value === group.values[entry.groupIndex]) return;
        this.remove(entry);
        if (value !== undefined) this.insert(entry, key, value);
    }

    /** Libera a lista de instâncias. */
    dispose(): void {
        for (const group of this.groups.values()) {
            for (const member of group.members) {
                member.groupOf = undefined;
                member.groupIndex = -1;
            }
        }
        this.groups.clear();
        this.list = null;
        this.resources.releaseInstanceList(this.declaration.schema);
    }

    private insert(entry: GroupMember, key: string, value: number): void {
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
        entry.groupOf = group;
        entry.groupIndex = index;
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
