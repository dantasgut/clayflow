import type {
    ComputeKernelBinding,
    EngineCore,
    StorageBufferSpec,
    UniformBufferSpec,
} from '../../../core/contracts/index';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import type { ResourceSystem } from '../../../scene/systems/ResourceSystem';
import type { World } from '../../../scene/world/World';
import { LCPSchema } from '../bodies/schemas/LCPSchema';
import { BoxCollider } from './BoxCollider';
import { MeshCollider } from './MeshCollider';
import { PlaneCollider } from './PlaneCollider';
import { SphereCollider } from './SphereCollider';

/** Pools de collider da Camada 3, na ordem em que os estágios os percorrem. */
export const COLLIDER_POOLS = [
    PlaneCollider.schema,
    BoxCollider.schema,
    SphereCollider.schema,
    MeshCollider.schema,
] as const;

/** Slot de dono para collider sem corpo (estático: o centro é a posição de mundo). */
export const NO_OWNER = 0xffffffff;

/** Contagens dos pools ligados no grupo de colliders (`ColliderSetCounts` no WGSL). */
export const ColliderSetCountsSchema = new StructSchema('ColliderSetCounts', {
    plane_count: FieldType.u32,
    box_count: FieldType.u32,
    sphere_count: FieldType.u32,
    mesh_count: FieldType.u32,
});

/** Visão de um pool de collider: buffer do pool, mapa de dono e contagem. */
export interface ColliderPoolView {
    /** Pool tipado (ou buffer mínimo se o pool não existe). */
    readonly buffer: StorageBufferSpec;
    /** `owners[slot]` = slot do corpo dono no pool de corpos, ou `NO_OWNER`. */
    readonly owners: StorageBufferSpec;
    /** Colliders no pool. */
    readonly count: number;
}

/** Opções do `ColliderSet`. */
export interface ColliderSetOptions {
    /** Prefixo dos discriminadores dos buffers próprios. */
    readonly discriminator: string;
    /** Pool dos corpos donos (pose dos colliders dinâmicos). Default `LCPSchema`. */
    readonly bodiesPoolKey?: string;
}

interface OwnerBuffer {
    spec: StorageBufferSpec;
    capacity: number;
}

/**
 * Conjunto de colliders compartilhado pelos estágios que colidem contra os pools tipados (narrowphase do LCP,
 * colisão dos fluidos). Mantém, por pool, o mapa collider → corpo dono (a pose de um collider dinâmico vem do corpo)
 * e buffers mínimos para pools ausentes, de modo que os bindings sejam sempre válidos.
 *
 * Os mapas são reconstruídos só quando marcados como sujos (pool realocado, entidades inseridas ou removidas);
 * `generation` muda quando algum buffer ligado muda — o consumidor recria seus bind groups.
 *
 * Grupo de colliders (`bindings()`, grupo 2 nos kernels de colisão): `b0` contagens, `b1–b3` pools de plano, caixa
 * e esfera, `b4–b6` mapas de dono, `b7` pool de corpos.
 */
export class ColliderSet {
    private readonly bodiesPoolKey: string;
    private readonly owners = new Map<string, OwnerBuffer>();
    private readonly empties = new Map<string, StorageBufferSpec>();
    private readonly counts = new Map<string, number>();
    private readonly boundPools = new Map<string, StorageBufferSpec>();
    private countsBuffer: UniformBufferSpec | null = null;
    private dirty = true;
    private gen = 0;

    constructor(
        private readonly core: EngineCore,
        private readonly world: World,
        private readonly resources: ResourceSystem,
        private readonly options: ColliderSetOptions,
    ) {
        this.bodiesPoolKey = options.bodiesPoolKey ?? LCPSchema.name;
    }

    /** Muda sempre que um buffer exposto por `pool()`/`bindings()` muda. */
    get generation(): number {
        return this.gen;
    }

    /** Total de colliders em todos os pools. */
    get totalCount(): number {
        let n = 0;
        for (const c of this.counts.values()) n += c;
        return n;
    }

    /** Marca os mapas de dono para reconstrução no próximo `refresh()`. */
    markDirty(): void {
        this.dirty = true;
    }

    /** Reação do estágio dono a `onPoolReallocated`: só pools de collider e de corpos afetam o conjunto. */
    onPoolReallocated(poolKey: string): void {
        if (poolKey === this.bodiesPoolKey || COLLIDER_POOLS.some((s) => s.name === poolKey)) {
            this.dirty = true;
        }
    }

    /** Reconstrói os mapas de dono e as contagens se sujos; garante buffers válidos para todos os pools. */
    refresh(): void {
        for (const schema of COLLIDER_POOLS) this.trackPoolBuffer(schema);
        if (!this.dirty && this.countsBuffer !== null) return;
        for (const schema of COLLIDER_POOLS) this.rebuildOwners(schema.name);
        this.writeCounts();
        this.dirty = false;
    }

    /** Visão de um pool de collider (válida depois de `refresh()`). */
    pool(poolKey: string): ColliderPoolView {
        const owners = this.owners.get(poolKey);
        if (owners === undefined)
            throw new Error(`ColliderSet: refresh() antes de pool('${poolKey}')`);
        return {
            buffer: this.poolBuffer(poolKey),
            owners: owners.spec,
            count: this.counts.get(poolKey) ?? 0,
        };
    }

    /** Pool de corpos donos (ou buffer mínimo). */
    bodiesBuffer(): StorageBufferSpec {
        return (
            this.resources.poolBufferSpec(this.bodiesPoolKey)
            ?? this.empty(this.bodiesPoolKey, LCPSchema.stride)
        );
    }

    /** Bindings do grupo de colliders (plano, caixa e esfera) — ver a documentação da classe. */
    bindings(): ComputeKernelBinding[] {
        if (this.countsBuffer === null)
            throw new Error('ColliderSet: refresh() antes de bindings()');
        const plane = this.pool(PlaneCollider.schema.name);
        const box = this.pool(BoxCollider.schema.name);
        const sphere = this.pool(SphereCollider.schema.name);
        return [
            { binding: 0, type: 'uniform', buffer: this.countsBuffer },
            { binding: 1, type: 'read-only-storage', buffer: plane.buffer },
            { binding: 2, type: 'read-only-storage', buffer: box.buffer },
            { binding: 3, type: 'read-only-storage', buffer: sphere.buffer },
            { binding: 4, type: 'read-only-storage', buffer: plane.owners },
            { binding: 5, type: 'read-only-storage', buffer: box.owners },
            { binding: 6, type: 'read-only-storage', buffer: sphere.owners },
            { binding: 7, type: 'read-only-storage', buffer: this.bodiesBuffer() },
        ];
    }

    /** Libera os buffers próprios (mapas de dono, buffers mínimos, contagens). */
    destroy(): void {
        for (const o of this.owners.values()) this.core.destroy(o.spec);
        for (const e of this.empties.values()) this.core.destroy(e);
        if (this.countsBuffer !== null) this.core.destroy(this.countsBuffer);
        this.owners.clear();
        this.empties.clear();
        this.counts.clear();
        this.boundPools.clear();
        this.countsBuffer = null;
        this.dirty = true;
    }

    private poolBuffer(poolKey: string): StorageBufferSpec {
        const schema = COLLIDER_POOLS.find((s) => s.name === poolKey);
        if (schema === undefined)
            throw new Error(`ColliderSet: pool de collider desconhecido '${poolKey}'`);
        return this.resources.poolBufferSpec(poolKey) ?? this.empty(poolKey, schema.stride);
    }

    /** Detecta troca do buffer de um pool (realocação) e da pool de corpos: invalida bind groups dos consumidores. */
    private trackPoolBuffer(schema: StructSchema): void {
        for (const [key, current] of [
            [schema.name, this.poolBuffer(schema.name)],
            [this.bodiesPoolKey, this.bodiesBuffer()],
        ] as const) {
            if (this.boundPools.get(key) !== current) {
                this.boundPools.set(key, current);
                this.gen++;
                this.dirty = true;
            }
        }
    }

    private empty(key: string, stride: number): StorageBufferSpec {
        let spec = this.empties.get(key);
        if (spec === undefined) {
            spec = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `${this.options.discriminator}_empty_${key}`,
                byteSize: Math.max(16, stride),
            });
            this.empties.set(key, spec);
        }
        return spec;
    }

    private rebuildOwners(poolKey: string): void {
        const ids = this.world.queryBySchemaName(poolKey);
        const count = ids.length;
        const capacity = Math.max(4, count);
        let entry = this.owners.get(poolKey);
        if (entry === undefined || entry.capacity < capacity) {
            if (entry !== undefined) this.core.destroy(entry.spec);
            entry = {
                spec: this.core.create<StorageBufferSpec>({
                    kind: 'buffer',
                    subkind: 'storage',
                    discriminator: `${this.options.discriminator}_owners_${poolKey}_${capacity}`,
                    byteSize: capacity * 4,
                }),
                capacity,
            };
            this.owners.set(poolKey, entry);
            this.gen++;
        }
        const owners = new Uint32Array(entry.capacity).fill(NO_OWNER);
        for (const id of ids) {
            const slot = this.resources.poolSlotOf(poolKey, id);
            if (slot === undefined) continue;
            const owner = this.resources.poolSlotOf(this.bodiesPoolKey, id);
            if (owner !== undefined) owners[slot] = owner;
        }
        this.core.write(entry.spec, new Uint8Array(owners.buffer));
        this.counts.set(poolKey, count);
    }

    private writeCounts(): void {
        if (this.countsBuffer === null) {
            this.countsBuffer = this.core.create<UniformBufferSpec>({
                kind: 'buffer',
                subkind: 'uniform',
                discriminator: `${this.options.discriminator}_counts`,
                byteSize: ColliderSetCountsSchema.stride,
            });
            this.gen++;
        }
        this.core.write(
            this.countsBuffer,
            ColliderSetCountsSchema.pack({
                plane_count: this.counts.get(PlaneCollider.schema.name) ?? 0,
                box_count: this.counts.get(BoxCollider.schema.name) ?? 0,
                sphere_count: this.counts.get(SphereCollider.schema.name) ?? 0,
                mesh_count: this.counts.get(MeshCollider.schema.name) ?? 0,
            }),
        );
    }
}
