import type {
    BindGroupSpec,
    EngineCore,
    LayoutSpec,
    StorageBufferSpec,
    UniformBufferSpec,
} from '../../core/contracts/index';
import { ResourceState } from '../contracts/ResourceState';
import type { PoolDirectory } from '../contracts/PoolDirectory';
import type { Resource } from '../contracts/Resource';
import type { GPUDescriptor } from '../descriptors/GPUDescriptor';
import type { Schema } from '../descriptors/Schema';
import type { EventBus } from '../events/EventBus';
import { ResourceStateHandlerRegistry } from '../lifecycle/ResourceStateHandlerRegistry';
import type { World } from '../world/World';
import type { EntityId } from '../world/EntityId';
import { makeReactive } from './reactiveData';

type UploadPolicy = NonNullable<GPUDescriptor['upload']>;

interface PoolEntry {
    readonly poolKey: string;
    readonly stride: number;
    readonly schema: Schema;
    readonly upload: UploadPolicy;
    bufferSpec: StorageBufferSpec;
    layoutSpec: LayoutSpec;
    bindGroupSpec: BindGroupSpec;
    capacity: number;
    count: number;
    readonly slotByEntity: Map<EntityId, number>;
    readonly entityBySlot: Map<number, EntityId>;
    /** Slot → recurso e descritor que o ocupam (reempacotamento no crescimento). */
    readonly occupants: Map<number, { resource: Resource; schema: Schema }>;
    readonly freeList: number[];
    generation: number;
}

const INITIAL_POOL_CAPACITY = 16;

/**
 * ResourceSystem é a Camada 2 que gerencia o ciclo de vida dos Resources GPU —
 * alocação, envio, crescimento de pools e descarte. Reage a:
 *   - `resourcesChanged` (insert/remove do World) → aloca/descarta;
 *   - `resourceDirty` (automático via dado reativo, ou manual) → enfileira;
 *   - `frameRecording` (antes da gravação do quadro) → envia a fila de sujos, uma vez
 *     por recurso, e emite `resourceReady`.
 *
 * **Dado reativo**: ao alocar, `resource.data` passa a ser um proxy — qualquer mutação
 * (campo, componente de vetor, substituição de `data`) marca o recurso como sujo, sem
 * chamada manual.
 *
 * **Política de envio por descritor** (`GPUDescriptor.upload`):
 *   - `'always'` (default): envia na alocação e a cada sujo;
 *   - `'initial'`: envia só na alocação; recurso cujos descritores são todos
 *     `'initial'`/`'never'` entra em `GpuManaged` (mutações ignoradas, aviso único);
 *   - `'never'`: buffer produzido pela GPU; nunca escrito pela CPU.
 *
 * **Storage**:
 *   - `individual`: 1 GPUBuffer por Resource (single-instance: Camera, ShadowParams).
 *   - `pool`: 1 GPUBuffer compartilhado por N members do mesmo schema. Cresce 2× quando
 *     a capacidade estoura e emite `poolReallocated`. Um recurso com vários descritores
 *     em pool ocupa o **mesmo slot** em todos eles.
 */
export class ResourceSystem implements PoolDirectory {
    private readonly stateRegistry = new ResourceStateHandlerRegistry();
    private readonly pools = new Map<string, PoolEntry>();
    private readonly individuals = new Map<Resource, UniformBufferSpec | StorageBufferSpec>();
    private readonly allocated = new WeakSet<Resource>();
    private readonly dirty = new Set<Resource>();
    private readonly warnedGpuManaged = new Set<string>();
    private anonCounter = 0;

    constructor(
        private readonly core: EngineCore,
        private readonly events: EventBus,
        private readonly world: World,
    ) {
        this.events.on('resourcesChanged', (e) => {
            this.onResourcesChanged(e.added, e.removed);
        });
        this.events.on('resourceDirty', (e) => {
            this.markDirty(e.payload.resource);
        });
        this.events.on('frameRecording', () => {
            this.flushDirty();
        });
    }

    /** BindGroupSpec do pool — input para flows que consomem o pool inteiro. */
    poolBindGroup(poolKey: string): BindGroupSpec | undefined {
        return this.pools.get(poolKey)?.bindGroupSpec;
    }

    /** Número de slots ocupáveis no pool (maior slot já usado + 1). 0 se o pool não existe. */
    poolCount(poolKey: string): number {
        return this.pools.get(poolKey)?.count ?? 0;
    }

    /** Slot de um entityId dentro do pool (offset = slot × stride). */
    poolSlotOf(poolKey: string, entityId: EntityId): number | undefined {
        return this.pools.get(poolKey)?.slotByEntity.get(entityId);
    }

    /** EntityId que ocupa o slot dado dentro do pool. Inverso de `poolSlotOf`. */
    poolEntityBySlot(poolKey: string, slot: number): EntityId | undefined {
        return this.pools.get(poolKey)?.entityBySlot.get(slot);
    }

    /** StorageBufferSpec do pool — uso direto em pipelines custom. */
    poolBufferSpec(poolKey: string): StorageBufferSpec | undefined {
        return this.pools.get(poolKey)?.bufferSpec;
    }

    /**
     * Resolve o poolKey do primeiro descritor em pool do Resource (schema.name +
     * algoritmo, quando declarado), ou undefined se não usa pool.
     */
    poolKeyForResource(resource: Resource): string | undefined {
        for (const desc of resource.getDescriptors()) {
            if (desc.storage === 'pool' && desc.schema !== undefined) {
                return this.computePoolKey(desc.schema, resource);
            }
        }
        return undefined;
    }

    private onResourcesChanged(added: readonly Resource[], removed: readonly Resource[]): void {
        for (const r of added) this.allocate(r);
        for (const r of removed) this.dispose(r);
    }

    // ── Dado reativo e fila de sujos ────────────────────────────────────────

    private markDirty(resource: Resource): void {
        if (!this.allocated.has(resource)) return;
        const handler = this.stateRegistry.get(resource.state);
        if (handler.ignoreDirtyMark()) {
            if (resource.state === ResourceState.GpuManaged) this.warnGpuManaged(resource);
            return;
        }
        if (this.stateRegistry.canTransition(resource.state, ResourceState.Dirty)) {
            resource.state = ResourceState.Dirty;
        }
        this.dirty.add(resource);
    }

    private flushDirty(): void {
        if (this.dirty.size === 0) return;
        const batch = [...this.dirty];
        this.dirty.clear();
        for (const resource of batch) {
            if (!this.allocated.has(resource)) continue;
            this.upload(resource);
            if (this.stateRegistry.canTransition(resource.state, ResourceState.Ready)) {
                resource.state = ResourceState.Ready;
            }
            this.events.emit('resourceReady', { payload: { resource } });
        }
    }

    private installReactiveData(resource: Resource): void {
        const onChange = (): void => {
            this.markDirty(resource);
        };
        let proxied = makeReactive(resource.data, onChange);
        Object.defineProperty(resource, 'data', {
            configurable: true,
            enumerable: true,
            get: () => proxied,
            set: (next: Record<string, unknown>) => {
                proxied = makeReactive(next, onChange);
                onChange();
            },
        });
    }

    private warnGpuManaged(resource: Resource): void {
        const name = this.schemaNameOf(resource);
        if (this.warnedGpuManaged.has(name)) return;
        this.warnedGpuManaged.add(name);
        console.warn(
            `[ResourceSystem] Mutação ignorada em '${name}': após a inserção a GPU é dona deste dado `
                + "(descritor com upload 'initial'). Altere-o antes de inserir na cena.",
        );
    }

    // ── Alocação ─────────────────────────────────────────────────────────────

    private allocate(resource: Resource): void {
        if (resource.state !== ResourceState.Uninitialized) return;
        resource.state = ResourceState.Loading;
        this.installReactiveData(resource);

        const descs = resource.getDescriptors();
        const pooled = descs.filter((d) => d.storage === 'pool' && d.schema !== undefined);
        if (pooled.length > 0) this.allocatePooled(resource, pooled);
        for (const desc of descs) {
            if (desc.storage !== 'pool') this.allocateIndividual(resource, desc);
        }

        this.allocated.add(resource);
        resource.state = ResourceState.Ready;
        if (this.isGpuOwned(descs)) resource.state = ResourceState.GpuManaged;
        this.events.emit('resourceReady', { payload: { resource } });
    }

    /** Recurso cujos descritores materializados são todos 'initial'/'never'. */
    private isGpuOwned(descs: readonly GPUDescriptor[]): boolean {
        const materialized = descs.filter((d) => d.schema !== undefined && isBufferRole(d));
        return materialized.length > 0 && materialized.every((d) => policyOf(d) !== 'always');
    }

    private allocateIndividual(resource: Resource, desc: GPUDescriptor): void {
        if (desc.role === 'uniform' && desc.schema !== undefined) {
            const spec = this.core.create<UniformBufferSpec>({
                kind: 'buffer',
                subkind: 'uniform',
                discriminator: `${desc.id}:${this.identityOf(resource)}`,
                byteSize: alignUp(desc.schema.stride, 16),
            });
            this.individuals.set(resource, spec);
            if (policyOf(desc) !== 'never') {
                this.core.write(
                    spec,
                    (resource.data._initialBytes as ArrayBufferView | undefined)
                        ?? desc.schema.pack(resource.data),
                );
            }
        } else if (
            (desc.role === 'storage-rw' || desc.role === 'storage-ro')
            && desc.schema !== undefined
        ) {
            const count = desc.count ?? 1;
            const spec = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `${desc.id}:${this.identityOf(resource)}`,
                byteSize: alignUp(desc.schema.stride * count, 16),
            });
            this.individuals.set(resource, spec);
        }
    }

    /** Aloca um único slot para o recurso, comum a todos os seus pools. */
    private allocatePooled(resource: Resource, descs: readonly GPUDescriptor[]): void {
        const entries: { desc: GPUDescriptor; schema: Schema; entry: PoolEntry }[] = [];
        for (const desc of descs) {
            const schema = desc.schema;
            if (schema === undefined) continue;
            const poolKey = this.computePoolKey(schema, resource);
            const entry = this.pools.get(poolKey) ?? this.createPool(poolKey, desc, schema);
            entries.push({ desc, schema, entry });
        }
        const slot = this.chooseSlot(entries.map((e) => e.entry));
        const entityId = this.world.entityIdOfResource(resource);
        for (const { desc, schema, entry } of entries) {
            const freeIdx = entry.freeList.indexOf(slot);
            if (freeIdx >= 0) entry.freeList.splice(freeIdx, 1);
            while (slot >= entry.capacity) this.growPool(entry);
            // Slots pulados (ocupados em outro pool do grupo) ficam livres neste pool.
            for (let s = entry.count; s < slot; s++) {
                if (!entry.occupants.has(s) && !entry.freeList.includes(s)) entry.freeList.push(s);
            }
            entry.count = Math.max(entry.count, slot + 1);
            entry.occupants.set(slot, { resource, schema });
            if (entityId !== undefined) {
                entry.slotByEntity.set(entityId, slot);
                entry.entityBySlot.set(slot, entityId);
            }
            if (policyOf(desc) !== 'never') {
                this.core.write(entry.bufferSpec, schema.pack(resource.data), slot * entry.stride);
            }
        }
    }

    /** Menor slot livre em todos os pools do grupo (free-list do primeiro, depois o fim). */
    private chooseSlot(entries: readonly PoolEntry[]): number {
        const [first, ...rest] = entries;
        const isFreeEverywhere = (slot: number): boolean =>
            rest.every((e) => !e.occupants.has(slot));
        for (const candidate of first?.freeList ?? []) {
            if (isFreeEverywhere(candidate)) return candidate;
        }
        let slot = Math.max(...entries.map((e) => e.count));
        while (!entries.every((e) => !e.occupants.has(slot))) slot++;
        return slot;
    }

    private createPool(poolKey: string, desc: GPUDescriptor, schema: Schema): PoolEntry {
        const stride = alignUp(schema.stride, 16);
        const capacity = INITIAL_POOL_CAPACITY;
        const bufferSpec = this.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: `pool:${poolKey}`,
            byteSize: stride * capacity,
        });
        const layoutSpec = this.core.create<LayoutSpec>({
            kind: 'layout',
            discriminator: `pool_layout:${poolKey}`,
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    kind: 'buffer',
                    type: 'storage',
                },
            ],
        });
        const bindGroupSpec = this.core.create<BindGroupSpec>({
            kind: 'bindgroup',
            discriminator: `pool_bg:${poolKey}:0`,
            layout: layoutSpec,
            bindings: [{ binding: 0, kind: 'buffer', buffer: bufferSpec }],
        });
        const entry: PoolEntry = {
            poolKey,
            stride,
            schema,
            upload: policyOf(desc),
            bufferSpec,
            layoutSpec,
            bindGroupSpec,
            capacity,
            count: 0,
            slotByEntity: new Map(),
            entityBySlot: new Map(),
            occupants: new Map(),
            freeList: [],
            generation: 0,
        };
        this.pools.set(poolKey, entry);
        return entry;
    }

    private growPool(entry: PoolEntry): void {
        const oldByteSize = entry.bufferSpec.byteSize;
        const oldSpec = entry.bufferSpec;
        entry.capacity *= 2;
        entry.bufferSpec = this.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: `pool:${entry.poolKey}:gen${++entry.generation}`,
            byteSize: entry.stride * entry.capacity,
        });
        entry.bindGroupSpec = this.core.create<BindGroupSpec>({
            kind: 'bindgroup',
            discriminator: `pool_bg:${entry.poolKey}:${entry.generation}`,
            layout: entry.layoutSpec,
            bindings: [{ binding: 0, kind: 'buffer', buffer: entry.bufferSpec }],
        });
        // Preserva o conteúdo conforme quem é dono do dado:
        //   - 'initial': a GPU é dona (ex.: simulação) — copia o buffer antigo na GPU;
        //     reempacotar da CPU reverteria o estado simulado ao valor inicial.
        //   - 'always': reempacota da CPU (fonte de verdade).
        //   - 'never': não há dado na CPU; o produtor recalcula ao receber `poolReallocated`.
        // A cópia grava um comando próprio: crescer durante a gravação de um quadro não é
        // suportado (alocações ocorrem em `resourcesChanged`, fora da gravação).
        if (entry.upload === 'initial') {
            const target = entry.bufferSpec;
            this.core.record(`pool_grow:${entry.poolKey}`, (frame) => {
                frame.copy(oldSpec, target, oldByteSize);
            });
            this.core.submit();
        } else if (entry.upload === 'always') {
            for (const [slot, { resource, schema }] of entry.occupants) {
                this.core.write(entry.bufferSpec, schema.pack(resource.data), slot * entry.stride);
            }
        }
        this.core.destroy(oldSpec);
        this.events.emit('poolReallocated', {
            poolKey: entry.poolKey,
            oldByteSize,
            newByteSize: entry.bufferSpec.byteSize,
        });
    }

    // ── Descarte ─────────────────────────────────────────────────────────────

    private dispose(resource: Resource): void {
        const handler = this.stateRegistry.get(resource.state);
        if (!handler.validTransitions().includes(ResourceState.Disposed)) {
            // already disposed/destroyed/etc.
            return;
        }
        resource.state = ResourceState.Disposed;
        this.allocated.delete(resource);
        this.dirty.delete(resource);
        const ind = this.individuals.get(resource);
        if (ind !== undefined) {
            this.core.destroy(ind);
            this.individuals.delete(resource);
        }
        for (const desc of resource.getDescriptors()) {
            if (desc.storage !== 'pool' || desc.schema === undefined) continue;
            const entry = this.pools.get(this.computePoolKey(desc.schema, resource));
            if (entry === undefined) continue;
            for (const [slot, occupant] of entry.occupants) {
                if (occupant.resource !== resource) continue;
                entry.occupants.delete(slot);
                const eid = entry.entityBySlot.get(slot);
                if (eid !== undefined) entry.slotByEntity.delete(eid);
                entry.entityBySlot.delete(slot);
                entry.freeList.push(slot);
                break;
            }
        }
        resource.state = ResourceState.Destroyed;
    }

    // ── Envio ────────────────────────────────────────────────────────────────

    /** Envia os descritores 'always' do recurso (individual inteiro / pool no slot). */
    private upload(resource: Resource): void {
        for (const desc of resource.getDescriptors()) {
            if (desc.schema === undefined || policyOf(desc) !== 'always') continue;
            if (desc.storage === 'pool') {
                const entry = this.pools.get(this.computePoolKey(desc.schema, resource));
                if (entry === undefined) continue;
                for (const [slot, occupant] of entry.occupants) {
                    if (occupant.resource !== resource) continue;
                    this.core.write(
                        entry.bufferSpec,
                        desc.schema.pack(resource.data),
                        slot * entry.stride,
                    );
                    break;
                }
            } else if (isBufferRole(desc)) {
                const ind = this.individuals.get(resource);
                if (ind !== undefined) this.core.write(ind, desc.schema.pack(resource.data));
            }
        }
    }

    private computePoolKey(schema: Schema, resource: Resource): string {
        const algorithm = resource.getFlowDescriptors?.()[0]?.algorithm;
        if (algorithm !== undefined) return `${schema.name}:${algorithm}`;
        return schema.name;
    }

    private schemaNameOf(resource: Resource): string {
        for (const desc of resource.getDescriptors()) {
            if (desc.schema !== undefined) return desc.schema.name;
        }
        return 'Resource';
    }

    private identityOf(resource: Resource): string {
        const schemaName = this.schemaNameOf(resource);
        const id = this.world.entityIdOfResource(resource);
        return id !== undefined ? `${schemaName}#${id}` : `${schemaName}@anon${this.anonCounter++}`;
    }
}

function policyOf(desc: GPUDescriptor): UploadPolicy {
    return desc.upload ?? 'always';
}

function isBufferRole(desc: GPUDescriptor): boolean {
    return desc.role === 'uniform' || desc.role === 'storage-ro' || desc.role === 'storage-rw';
}

function alignUp(value: number, alignment: number): number {
    return Math.ceil(value / alignment) * alignment;
}
