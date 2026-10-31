import { NONE } from '../../../scene/shaders/engineConstants';
import { MAX_SURFACE_COLLIDERS as MAX_SURFACE_COLLIDERS_CONSTANT } from '../../gpu/shaders/constants';
import type { PoolBufferSpec } from '../../../scene/contracts/PoolDirectory';
import type { StorageBufferSpec } from '../../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../../scene/contracts/ResourceDirectory';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { BindingSource } from '../../../scene/flows/FlowBinding';
import type { WorkContext, WorkPart } from '../../../scene/flows/FlowWork';
import { GpuWordSchema } from '../../gpu/compute/schemas';
import type { WgslResource } from '../../../scene/shaders/WgslResource';
import { ColliderSetCountsSchema, colliderResources as C } from './colliderResources';

export { ColliderSetCountsSchema } from './colliderResources';

import type { StructSchema } from '../../../scene/descriptors/StructSchema';
import type { World } from '../../../scene/world/World';
import { LCPSchema } from '../bodies/schemas/LCPSchema';
import { BoxCollider } from './BoxCollider';
import { MeshCollider } from './MeshCollider';
import { PlaneCollider } from './PlaneCollider';
import { SphereCollider } from './SphereCollider';
import { SurfaceCollider } from './SurfaceCollider';
import { SurfacePhysics } from '../wetting/SurfacePhysics';

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
    /** Prefixo dos ids dos descritores no Resource de trabalho. */
    readonly discriminator: string;
    /** Pool dos corpos donos (pose dos colliders dinâmicos). Default `LCPSchema`. */
    readonly bodiesPoolKey?: string;
}

/** Chaves dos buffers mínimos (pool ausente): os colliders, os corpos e o campo das superfícies. */
const EMPTY_STRIDES = (bodiesPoolKey: string): readonly (readonly [string, number])[] => [
    ...COLLIDER_POOLS.map((s) => [s.name, s.stride] as const),
    [bodiesPoolKey, LCPSchema.stride],
    [SurfaceCollider.cellSchema.name, 16],
];

/**
 * Conjunto de colliders compartilhado pelos estágios que colidem contra os pools tipados (narrowphase do LCP,
 * colisão dos fluidos) — peça dos slots do Flow (`slot.pools` dos colliders): mantém, por pool, o mapa collider →
 * corpo dono (a pose de um collider dinâmico vem do corpo) e buffers mínimos para pools ausentes, de modo que os
 * bindings sejam sempre válidos.
 *
 * Os mapas são descritores do Resource de trabalho do Flow dono (spec 039: a C2 aloca, envia no mesmo quadro e
 * libera), reconstruídos numa **transição** (entidades de collider inseridas ou removidas, pool realocado —
 * `markDirty` + `refresh`), nunca no `dispatch`; `refresh()` devolve se alguma fonte mudou e o Flow religa
 * `sources()` (`ctx.bind`).
 *
 * Fontes do grupo de colliders (`sources()`, nomes do `collider_set.wgsl`): contagens, pools de plano, caixa, esfera,
 * malha e superfície, o mapa de donos comum (caixas e esferas; o da malha à parte), o pool de corpos e o campo das
 * superfícies. Os mapas por pool (`pool(key).owners`) continuam para a narrowphase do LCP.
 */
export class ColliderSet implements WorkPart {
    private readonly bodiesPoolKey: string;
    private readonly resources: ResourceDirectory;
    /** Capacidade (palavras) de cada mapa de dono por pool. */
    private readonly owners = new Map<string, number>();
    private readonly counts = new Map<string, number>();
    private readonly boundPools = new Map<string, PoolBufferSpec>();
    /** Buffers expostos na última vez (a troca de um deles muda `generation`). */
    private readonly exposed = new Map<string, unknown>();
    private hasCounts = false;
    /** Donos das caixas e das esferas num só mapa (`collider_owners`): um binding de storage a menos por estágio. */
    private sharedOwners = 0;
    /** A superfície física de cada collider (`collider_surfaces`: planos, caixas, esferas, superfícies). */
    private surfaceMap = 0;
    private warnedSurfaces = false;
    /** Raio envolvente de cada collider de caixa e de esfera, por slot (para a broadphase). */
    private readonly radii = new Map<string, Float32Array>();
    /** Donos por slot de cada pool (o que foi escrito no mapa do pool), para o mapa comum. */
    private readonly ownerValues = new Map<string, Uint32Array>();
    private largeCapacity = 0;
    private shape: BroadphaseShape | null = null;
    private dirty = true;
    private gen = 0;

    constructor(
        private readonly ctx: WorkContext,
        private readonly world: World,
        private readonly options: ColliderSetOptions,
    ) {
        this.bodiesPoolKey = options.bodiesPoolKey ?? LCPSchema.name;
        this.resources = ctx.resources;
        ctx.work.use(this);
    }

    descriptors(): readonly GPUDescriptor[] {
        const d = this.options.discriminator;
        const words = (id: string, count: number): GPUDescriptor => ({
            id,
            role: 'storage-ro',
            schema: GpuWordSchema,
            count,
        });
        const out: GPUDescriptor[] = EMPTY_STRIDES(this.bodiesPoolKey).map(([key, stride]) => ({
            id: `${d}:empty:${key}`,
            role: 'storage-rw',
            schema: GpuWordSchema,
            upload: 'never',
            count: Math.max(4, stride / 4),
        }));
        for (const [key, capacity] of this.owners) out.push(words(`${d}:owners:${key}`, capacity));
        if (this.sharedOwners > 0) out.push(words(`${d}:owners`, this.sharedOwners));
        if (this.surfaceMap > 0) out.push(words(`${d}:surfaces`, this.surfaceMap));
        if (this.largeCapacity > 0) out.push(words(`${d}:large`, this.largeCapacity));
        if (this.hasCounts)
            out.push({ id: `${d}:counts`, role: 'uniform', schema: ColliderSetCountsSchema });
        return out;
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
        if (!this.dirty && this.hasCounts) return this.gen !== before;
        // As capacidades primeiro (uma redescrição do trabalho só), depois os conteúdos.
        for (const schema of COLLIDER_POOLS) this.sizeOwners(schema.name);
        this.sizeShared();
        this.hasCounts = true;
        this.ctx.work.refresh();
        for (const schema of COLLIDER_POOLS) this.rebuildOwners(schema.name);
        this.rebuildSharedOwners();
        this.rebuildSurfaces();
        this.writeCounts();
        this.rebuildBroadphase();
        this.trackExposed();
        this.dirty = false;
        return this.gen !== before;
    }

    /** O buffer alocado pela C2 para o descritor `name` do conjunto. */
    private own(name: string): StorageBufferSpec {
        const buffer = this.resources.bufferOf(
            this.ctx.work,
            `${this.options.discriminator}:${name}`,
        );
        if (buffer === undefined)
            throw new Error(`ColliderSet: '${name}' sem buffer — refresh() antes do uso.`);
        return buffer as StorageBufferSpec;
    }

    /** Põe o conteúdo do descritor `name` (enviado pela C2 antes da gravação do quadro). */
    private put(name: string, bytes: ArrayBufferView): void {
        this.ctx.work.data[`${this.options.discriminator}:${name}`] = bytes;
    }

    /** Muda `generation` quando a C2 trocou algum buffer exposto (realocação). */
    private trackExposed(): void {
        const names = [
            ...[...this.owners.keys()].map((k) => `owners:${k}`),
            'owners',
            'surfaces',
            'large',
            'counts',
        ];
        for (const name of names) {
            const current = this.resources.bufferOf(
                this.ctx.work,
                `${this.options.discriminator}:${name}`,
            );
            if (this.exposed.get(name) !== current) {
                this.exposed.set(name, current);
                this.gen++;
            }
        }
    }

    /** Fontes dos recursos do conjunto de colliders (`colliderResources`; válidas depois de `refresh()`). */
    sources(): ReadonlyMap<WgslResource, BindingSource> {
        if (!this.hasCounts) throw new Error('ColliderSet: refresh() antes de sources()');
        const plane = this.pool(PlaneCollider.schema.name);
        const box = this.pool(BoxCollider.schema.name);
        const sphere = this.pool(SphereCollider.schema.name);
        const mesh = this.pool(MeshCollider.schema.name);
        return new Map<WgslResource, BindingSource>([
            [C.counts, this.own('counts')],
            [C.planes, plane.buffer],
            [C.boxes, box.buffer],
            [C.spheres, sphere.buffer],
            [C.meshes, mesh.buffer],
            [C.owners, this.own('owners')],
            [C.meshOwners, mesh.owners],
            [C.bodies, this.bodiesBuffer()],
            [C.surfaceField, this.fieldBuffer()],
            [C.surfaces, this.own('surfaces')],
        ]);
    }

    /** Visão de um pool de collider (válida depois de `refresh()`). */
    pool(poolKey: string): ColliderPoolView {
        if (!this.owners.has(poolKey))
            throw new Error(`ColliderSet: refresh() antes de pool('${poolKey}')`);
        return {
            buffer: this.poolBuffer(poolKey),
            owners: this.own(`owners:${poolKey}`),
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

    /** Buffer mínimo de um pool ausente (descritor do trabalho, declarado na construção). */
    private empty(key: string, _stride: number): StorageBufferSpec {
        return this.own(`empty:${key}`);
    }

    /** Capacidade do mapa de donos de um pool: cresce com os colliders, nunca abaixo de 4. */
    private sizeOwners(poolKey: string): void {
        const capacity = Math.max(4, this.world.queryBySchemaName(poolKey).length);
        if ((this.owners.get(poolKey) ?? 0) < capacity) this.owners.set(poolKey, capacity);
    }

    /** Capacidades dos mapas comuns (donos de caixas + esferas; superfícies de todos os colliders). */
    private sizeShared(): void {
        const n = (key: string): number => this.world.queryBySchemaName(key).length;
        const shared = Math.max(4, n(BoxCollider.schema.name) + n(SphereCollider.schema.name));
        if (this.sharedOwners < shared) this.sharedOwners = shared;
        const surfaces = Math.max(
            4,
            [PlaneCollider, BoxCollider, SphereCollider, SurfaceCollider].reduce(
                (total, c) => total + n(c.schema.name),
                0,
            ),
        );
        if (this.surfaceMap < surfaces) this.surfaceMap = surfaces;
    }

    private rebuildOwners(poolKey: string): void {
        const ids = this.world.queryBySchemaName(poolKey);
        const count = ids.length;
        const capacity = this.owners.get(poolKey)!;
        const owners = new Uint32Array(capacity).fill(NO_OWNER);
        const radii = new Float32Array(capacity);
        for (const id of ids) {
            const slot = this.resources.poolSlotOf(poolKey, id);
            if (slot === undefined) continue;
            const owner = this.resources.poolSlotOf(this.bodiesPoolKey, id);
            if (owner !== undefined) owners[slot] = owner;
            radii[slot] = this.boundingRadius(poolKey, id);
        }
        this.radii.set(poolKey, radii);
        this.ownerValues.set(poolKey, owners);
        this.put(`owners:${poolKey}`, owners);
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
        const all = new Uint32Array(this.sharedOwners).fill(NO_OWNER);
        all.set(this.ownerValues.get(BoxCollider.schema.name)?.subarray(0, boxCount) ?? []);
        all.set(
            this.ownerValues.get(SphereCollider.schema.name)?.subarray(0, sphereCount) ?? [],
            boxCount,
        );
        this.put('owners', all);
    }

    /**
     * A superfície física de cada collider (spec 034): a posição da entidade dele entre as que têm `SurfacePhysics` + 1
     * (a ordem da consulta, a mesma de quem monta a tabela delas), 0 sem ela ou além de `SurfacePhysics.MAX`.
     */
    private rebuildSurfaces(): void {
        const pools = [PlaneCollider, BoxCollider, SphereCollider, SurfaceCollider].map(
            (c) => c.schema.name,
        );
        const surfaces = this.world.queryBySchemaName(SurfacePhysics.schema.name);
        const all = new Uint32Array(this.surfaceMap);
        let base = 0;
        for (const key of pools) {
            const count = this.counts.get(key) ?? 0;
            for (const id of this.world.queryBySchemaName(key)) {
                const slot = this.resources.poolSlotOf(key, id);
                const k = surfaces.indexOf(id);
                if (slot === undefined || slot >= count || k < 0 || k >= SurfacePhysics.MAX)
                    continue;
                all[base + slot] = k + 1;
            }
            base += count;
        }
        this.put('surfaces', all);
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
        if (this.largeCapacity < capacity) {
            this.largeCapacity = capacity;
            this.ctx.work.refresh();
        }
        const list = new Uint32Array(this.largeCapacity);
        list.set(large);
        this.put('large', list);
        this.shape = {
            boxCount,
            sphereCount,
            maxSmallRadius: maxSmall,
            largeRadius,
            large: this.own('large'),
            largeCount: large.length,
        };
    }

    private writeCounts(): void {
        this.put(
            'counts',
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
