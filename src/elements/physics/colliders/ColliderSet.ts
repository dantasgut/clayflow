import { NONE } from '../../../scene/shaders/engineConstants';
import { MAX_SURFACE_COLLIDERS as MAX_SURFACE_COLLIDERS_CONSTANT } from '../../gpu/shaders/constants';
import type { PoolBufferSpec } from '../../../scene/contracts/PoolDirectory';
import type {
    EngineCore,
    StorageBufferSpec,
    UniformBufferSpec,
} from '../../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../../scene/contracts/ResourceDirectory';
import type { BindingSource } from '../../../scene/flows/FlowBinding';

type NamedSources = Readonly<Record<string, BindingSource>>;
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import type { World } from '../../../scene/world/World';
import { LCPSchema } from '../bodies/schemas/LCPSchema';
import { BoxCollider } from './BoxCollider';
import { MeshCollider } from './MeshCollider';
import { PlaneCollider } from './PlaneCollider';
import { SphereCollider } from './SphereCollider';
import { SurfaceCollider } from './SurfaceCollider';

/** Pools de collider da Camada 3, na ordem em que os estágios os percorrem. */
export const COLLIDER_POOLS = [
    PlaneCollider.schema,
    BoxCollider.schema,
    SphereCollider.schema,
    MeshCollider.schema,
    SurfaceCollider.schema,
] as const;

/** Pools de dado dos colliders (campo das superfícies, spec 010): realocação religa como a dos registros. */
export const COLLIDER_DATA_POOLS = [SurfaceCollider.cellSchema] as const;

/** Chaves de todos os pools de collider (registros e dados), para os slots `slot.pools` dos estágios. */
export const COLLIDER_POOL_KEYS: readonly string[] = [
    ...COLLIDER_POOLS,
    ...COLLIDER_DATA_POOLS,
].map((s) => s.name);

/** Slot de dono para collider sem corpo (estático: o centro é a posição de mundo). */
export const NO_OWNER = NONE.value;

/** Contagens dos pools ligados no grupo de colliders (`ColliderSetCounts` no WGSL). */
export const ColliderSetCountsSchema = new StructSchema('ColliderSetCounts', {
    plane_count: FieldType.u32,
    box_count: FieldType.u32,
    sphere_count: FieldType.u32,
    mesh_count: FieldType.u32,
    surface_count: FieldType.u32,
    /** Início das esferas no mapa de donos comum (`collider_owners`: caixas, depois esferas). */
    sphere_owner_base: FieldType.u32,
    _pad0: FieldType.u32,
    _pad1: FieldType.u32,
    /** Início do campo de cada colisor de superfície no pool (até `MAX_SURFACE_COLLIDERS`, 4 por vetor). */
    surface_first0: FieldType.vec4u,
    surface_first1: FieldType.vec4u,
    surface_first2: FieldType.vec4u,
    surface_first3: FieldType.vec4u,
});

/** Colliders de superfície consultados por estágio (os inícios dos campos vão no uniforme de contagens). */
export const MAX_SURFACE_COLLIDERS = MAX_SURFACE_COLLIDERS_CONSTANT.value;

/** Visão de um pool de collider: buffer do pool, mapa de dono e contagem. */
export interface ColliderPoolView {
    /** Pool tipado (ou buffer mínimo se o pool não existe). */
    readonly buffer: PoolBufferSpec;
    /** `owners[slot]` = slot do corpo dono no pool de corpos, ou `NO_OWNER`. */
    readonly owners: StorageBufferSpec;
    /** Colliders no pool. */
    readonly count: number;
}

/**
 * Dados da broadphase do LCP (spec 007, research R9), derivados do tamanho dos colliders de caixa e esfera: os
 * proxies são as caixas (`[0, boxCount)`) seguidas das esferas; os grandes (raio acima do limiar) ficam fora da grade e
 * são testados contra todos os corpos, e a célula da grade tem o dobro do maior raio dos pequenos.
 */
export interface BroadphaseShape {
    readonly boxCount: number;
    readonly sphereCount: number;
    /** Maior raio envolvente entre os proxies da grade (0 sem proxies). */
    readonly maxSmallRadius: number;
    /** Raio a partir do qual um proxy fica fora da grade. */
    readonly largeRadius: number;
    /** Índices de proxy dos grandes (u32), no mínimo 4 entradas. */
    readonly large: StorageBufferSpec;
    readonly largeCount: number;
}

/** Fator sobre o raio mediano a partir do qual um collider é grande (fora da grade). */
const LARGE_FACTOR = 4;

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
 * colisão dos fluidos) — peça dos slots do Flow (`slot.pools` dos colliders): mantém, por pool, o mapa collider →
 * corpo dono (a pose de um collider dinâmico vem do corpo) e buffers mínimos para pools ausentes, de modo que os
 * bindings sejam sempre válidos.
 *
 * Os mapas são recursos privados do Flow dono, reconstruídos numa **transição** (entidades de collider inseridas ou
 * removidas, pool realocado — `markDirty` + `refresh`), nunca no `dispatch`; `refresh()` devolve se alguma fonte
 * mudou e o Flow religa `sources()` (`ctx.bind`).
 *
 * Fontes do grupo de colliders (`sources()`, nomes do `collider_set.wgsl`): contagens, pools de plano, caixa, esfera,
 * malha e superfície, o mapa de donos comum (caixas e esferas; o da malha à parte), o pool de corpos e o campo das
 * superfícies. Os mapas por pool (`pool(key).owners`) continuam para a narrowphase do LCP.
 */
export class ColliderSet {
    private readonly bodiesPoolKey: string;
    private readonly owners = new Map<string, OwnerBuffer>();
    private readonly empties = new Map<string, StorageBufferSpec>();
    private readonly counts = new Map<string, number>();
    private readonly boundPools = new Map<string, PoolBufferSpec>();
    private countsBuffer: UniformBufferSpec | null = null;
    /** Donos das caixas e das esferas num só mapa (`collider_owners`): um binding de storage a menos por estágio. */
    private sharedOwners: OwnerBuffer | null = null;
    private warnedSurfaces = false;
    /** Raio envolvente de cada collider de caixa e de esfera, por slot (para a broadphase). */
    private readonly radii = new Map<string, Float32Array>();
    /** Donos por slot de cada pool (o que foi escrito no mapa do pool), para o mapa comum. */
    private readonly ownerValues = new Map<string, Uint32Array>();
    private largeBuffer: { spec: StorageBufferSpec; capacity: number } | null = null;
    private shape: BroadphaseShape | null = null;
    private dirty = true;
    private gen = 0;

    constructor(
        private readonly core: EngineCore,
        private readonly world: World,
        private readonly resources: ResourceDirectory,
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

    /** Colliders de superfície (spec 010). */
    get surfaceCount(): number {
        return this.counts.get(SurfaceCollider.schema.name) ?? 0;
    }

    /** Marca os mapas de dono para reconstrução no próximo `refresh()`. */
    markDirty(): void {
        this.dirty = true;
    }

    /** Reação do estágio dono ao evento `poolReallocated`: só pools de collider e de corpos afetam o conjunto. */
    onPoolReallocated(poolKey: string): void {
        if (
            poolKey === this.bodiesPoolKey
            || COLLIDER_POOLS.some((s) => s.name === poolKey)
            || COLLIDER_DATA_POOLS.some((s) => s.name === poolKey)
        ) {
            this.dirty = true;
        }
    }

    /**
     * Reconstrói os mapas de dono e as contagens se sujos; garante buffers válidos para todos os pools. Chamado numa
     * transição do Flow dono. Devolve `true` se alguma fonte de `sources()`/`pool()` mudou (religar).
     */
    refresh(): boolean {
        const before = this.gen;
        for (const schema of COLLIDER_POOLS) this.trackPoolBuffer(schema);
        this.trackDataBuffers();
        if (!this.dirty && this.countsBuffer !== null) return this.gen !== before;
        for (const schema of COLLIDER_POOLS) this.rebuildOwners(schema.name);
        this.rebuildSharedOwners();
        this.writeCounts();
        this.rebuildBroadphase();
        this.dirty = false;
        return this.gen !== before;
    }

    /** Fontes do grupo de colliders pelos nomes do `collider_set.wgsl` (válidas depois de `refresh()`). */
    sources(): NamedSources {
        if (this.countsBuffer === null)
            throw new Error('ColliderSet: refresh() antes de sources()');
        const plane = this.pool(PlaneCollider.schema.name);
        const box = this.pool(BoxCollider.schema.name);
        const sphere = this.pool(SphereCollider.schema.name);
        const mesh = this.pool(MeshCollider.schema.name);
        return {
            collider_counts: this.countsBuffer,
            collider_planes: plane.buffer,
            collider_boxes: box.buffer,
            collider_spheres: sphere.buffer,
            collider_meshes: mesh.buffer,
            collider_owners: this.sharedOwners!.spec,
            collider_mesh_owners: mesh.owners,
            collider_bodies: this.bodiesBuffer(),
            collider_surface_field: this.fieldBuffer(),
        };
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

    /** Dados da broadphase (válidos depois de `refresh()`). */
    broadphase(): BroadphaseShape {
        if (this.shape === null) throw new Error('ColliderSet: refresh() antes de broadphase()');
        return this.shape;
    }

    /** Pool de corpos donos (ou buffer mínimo). */
    bodiesBuffer(): PoolBufferSpec {
        return (
            this.resources.poolBufferSpec(this.bodiesPoolKey)
            ?? this.empty(this.bodiesPoolKey, LCPSchema.stride)
        );
    }

    /** Campo das superfícies (pool `SurfaceColliderCell`, ou buffer mínimo). */
    fieldBuffer(): PoolBufferSpec {
        const key = SurfaceCollider.cellSchema.name;
        return this.resources.poolBufferSpec(key) ?? this.empty(key, 16);
    }

    /** Libera os buffers próprios (mapas de dono, buffers mínimos, contagens). */
    destroy(): void {
        for (const o of this.owners.values()) this.core.destroy(o.spec);
        for (const e of this.empties.values()) this.core.destroy(e);
        if (this.countsBuffer !== null) this.core.destroy(this.countsBuffer);
        if (this.sharedOwners !== null) this.core.destroy(this.sharedOwners.spec);
        this.sharedOwners = null;
        if (this.largeBuffer !== null) this.core.destroy(this.largeBuffer.spec);
        this.largeBuffer = null;
        this.shape = null;
        this.radii.clear();
        this.owners.clear();
        this.empties.clear();
        this.counts.clear();
        this.boundPools.clear();
        this.countsBuffer = null;
        this.dirty = true;
    }

    private poolBuffer(poolKey: string): PoolBufferSpec {
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

    /** Troca do buffer do campo das superfícies (realocação): religar. */
    private trackDataBuffers(): void {
        const key = SurfaceCollider.cellSchema.name;
        const current = this.fieldBuffer();
        if (this.boundPools.get(key) !== current) {
            this.boundPools.set(key, current);
            this.gen++;
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
        const radii = new Float32Array(entry.capacity);
        for (const id of ids) {
            const slot = this.resources.poolSlotOf(poolKey, id);
            if (slot === undefined) continue;
            const owner = this.resources.poolSlotOf(this.bodiesPoolKey, id);
            if (owner !== undefined) owners[slot] = owner;
            radii[slot] = this.boundingRadius(poolKey, id);
        }
        this.radii.set(poolKey, radii);
        this.ownerValues.set(poolKey, owners);
        this.core.write(entry.spec, new Uint8Array(owners.buffer));
        this.counts.set(poolKey, count);
    }

    /** Início do campo de cada colisor de superfície, pelo slot do registro (4 por vetor do uniforme). */
    private surfaceFirsts(): Record<string, number[]> {
        const firsts = new Array<number>(MAX_SURFACE_COLLIDERS).fill(0);
        const ids = this.world.queryBySchemaName(SurfaceCollider.schema.name);
        if (ids.length > MAX_SURFACE_COLLIDERS && !this.warnedSurfaces) {
            this.warnedSurfaces = true;
            console.warn(
                `ColliderSet: ${ids.length} colliders de superfície; só os ${MAX_SURFACE_COLLIDERS} primeiros colidem.`,
            );
        }
        for (const id of ids) {
            const slot = this.resources.poolSlotOf(SurfaceCollider.schema.name, id);
            const first = this.resources.poolSlotOf(SurfaceCollider.cellSchema.name, id);
            if (slot === undefined || first === undefined || slot >= MAX_SURFACE_COLLIDERS)
                continue;
            firsts[slot] = first;
        }
        return {
            surface_first0: firsts.slice(0, 4),
            surface_first1: firsts.slice(4, 8),
            surface_first2: firsts.slice(8, 12),
            surface_first3: firsts.slice(12, 16),
        };
    }

    /** Mapa de donos comum do grupo de colliders: as caixas a partir de 0, as esferas a partir do total de caixas. */
    private rebuildSharedOwners(): void {
        const boxCount = this.counts.get(BoxCollider.schema.name) ?? 0;
        const sphereCount = this.counts.get(SphereCollider.schema.name) ?? 0;
        const capacity = Math.max(4, boxCount + sphereCount);
        if (this.sharedOwners === null || this.sharedOwners.capacity < capacity) {
            if (this.sharedOwners !== null) this.core.destroy(this.sharedOwners.spec);
            this.sharedOwners = {
                spec: this.core.create<StorageBufferSpec>({
                    kind: 'buffer',
                    subkind: 'storage',
                    discriminator: `${this.options.discriminator}_owners_${capacity}`,
                    byteSize: capacity * 4,
                }),
                capacity,
            };
            this.gen++;
        }
        const all = new Uint32Array(this.sharedOwners.capacity).fill(NO_OWNER);
        all.set(this.ownerValues.get(BoxCollider.schema.name)?.subarray(0, boxCount) ?? []);
        all.set(
            this.ownerValues.get(SphereCollider.schema.name)?.subarray(0, sphereCount) ?? [],
            boxCount,
        );
        this.core.write(this.sharedOwners.spec, new Uint8Array(all.buffer));
    }

    /** Raio da esfera envolvente do collider (caixa: meia-diagonal; esfera: o raio); 0 para outras formas. */
    private boundingRadius(poolKey: string, id: Parameters<World['resourcesOf']>[0]): number {
        if (poolKey !== BoxCollider.schema.name && poolKey !== SphereCollider.schema.name) return 0;
        for (const r of this.world.resourcesOf(id)) {
            if (poolKey === SphereCollider.schema.name && r instanceof SphereCollider)
                return Math.abs(r.data.radius);
            if (poolKey === BoxCollider.schema.name && r instanceof BoxCollider) {
                const h = r.data.halfExtents;
                return Math.hypot(h[0] ?? 0, h[1] ?? 0, h[2] ?? 0);
            }
        }
        return 0;
    }

    /**
     * Proxies da broadphase: os colliders de caixa e de esfera em `[0, contagem)` de cada pool (os mesmos que a
     * narrowphase exaustiva percorria), o limiar de "grande" (`LARGE_FACTOR` × raio mediano), o maior raio dos pequenos
     * e a lista dos grandes.
     */
    private rebuildBroadphase(): void {
        const boxCount = this.counts.get(BoxCollider.schema.name) ?? 0;
        const sphereCount = this.counts.get(SphereCollider.schema.name) ?? 0;
        const boxR = this.radii.get(BoxCollider.schema.name) ?? new Float32Array(0);
        const sphR = this.radii.get(SphereCollider.schema.name) ?? new Float32Array(0);
        const all = new Float32Array(boxCount + sphereCount);
        for (let j = 0; j < boxCount; j++) all[j] = boxR[j] ?? 0;
        for (let j = 0; j < sphereCount; j++) all[boxCount + j] = sphR[j] ?? 0;
        const sorted = Float32Array.from(all).sort();
        const median = sorted.length === 0 ? 0 : sorted[sorted.length >> 1]!;
        const largeRadius = median > 0 ? median * LARGE_FACTOR : Infinity;
        const large: number[] = [];
        let maxSmall = 0;
        all.forEach((r, i) => {
            if (r > largeRadius) large.push(i);
            else maxSmall = Math.max(maxSmall, r);
        });
        const capacity = Math.max(4, large.length);
        if (this.largeBuffer === null || this.largeBuffer.capacity < capacity) {
            if (this.largeBuffer !== null) this.core.destroy(this.largeBuffer.spec);
            this.largeBuffer = {
                spec: this.core.create<StorageBufferSpec>({
                    kind: 'buffer',
                    subkind: 'storage',
                    discriminator: `${this.options.discriminator}_large_${capacity}`,
                    byteSize: capacity * 4,
                }),
                capacity,
            };
            this.gen++;
        }
        const list = new Uint32Array(this.largeBuffer.capacity);
        list.set(large);
        this.core.write(this.largeBuffer.spec, new Uint8Array(list.buffer));
        this.shape = {
            boxCount,
            sphereCount,
            maxSmallRadius: maxSmall,
            largeRadius,
            large: this.largeBuffer.spec,
            largeCount: large.length,
        };
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
                surface_count: Math.min(
                    this.counts.get(SurfaceCollider.schema.name) ?? 0,
                    MAX_SURFACE_COLLIDERS,
                ),
                sphere_owner_base: this.counts.get(BoxCollider.schema.name) ?? 0,
                _pad0: 0,
                _pad1: 0,
                ...this.surfaceFirsts(),
            }),
        );
    }
}
