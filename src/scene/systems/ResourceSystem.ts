import type {
    BindGroupSpec,
    EngineCore,
    LayoutSpec,
    StorageBufferSpec,
    UniformBufferSpec,
} from '../../core/contracts/index';
import { ResourceState } from '../contracts/ResourceState';
import type { Resource } from '../contracts/Resource';
import type { GPUDescriptor } from '../descriptors/GPUDescriptor';
import type { Schema } from '../descriptors/Schema';
import type { EventBus } from '../events/EventBus';
import { ResourceStateHandlerRegistry } from '../lifecycle/ResourceStateHandlerRegistry';
import type { World } from '../world/World';
import type { EntityId } from '../world/EntityId';

interface PoolEntry {
    readonly poolKey: string;
    readonly stride: number;
    readonly schema: Schema;
    bufferSpec: StorageBufferSpec;
    layoutSpec: LayoutSpec;
    bindGroupSpec: BindGroupSpec;
    capacity: number;
    count: number;
    readonly slotByEntity: Map<EntityId, number>;
    readonly entityBySlot: Map<number, EntityId>;
    readonly freeList: number[];
    generation: number;
}

const INITIAL_POOL_CAPACITY = 16;

export class ResourceSystem {
    private readonly stateRegistry = new ResourceStateHandlerRegistry();
    private readonly pools = new Map<string, PoolEntry>();
    private readonly individuals = new Map<Resource, UniformBufferSpec | StorageBufferSpec>();

    constructor(
        private readonly core: EngineCore,
        private readonly events: EventBus,
        private readonly world: World,
    ) {
        this.events.on('resourcesChanged', e => this.onResourcesChanged(e.added, e.removed));
        this.events.on('resourceDirty', e => this.onResourceDirty(e.payload.resource));
    }

    poolBindGroup(poolKey: string): BindGroupSpec | undefined {
        return this.pools.get(poolKey)?.bindGroupSpec;
    }

    poolCount(poolKey: string): number {
        return this.pools.get(poolKey)?.count ?? 0;
    }

    poolSlotOf(poolKey: string, entityId: EntityId): number | undefined {
        return this.pools.get(poolKey)?.slotByEntity.get(entityId);
    }

    poolBufferSpec(poolKey: string): StorageBufferSpec | undefined {
        return this.pools.get(poolKey)?.bufferSpec;
    }

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

    private onResourceDirty(resource: Resource): void {
        const handler = this.stateRegistry.get(resource.state);
        if (handler.ignoreDirtyMark()) return;
        if (this.stateRegistry.canTransition(resource.state, ResourceState.Dirty)) {
            resource.state = ResourceState.Dirty;
        }
        this.upload(resource);
        if (this.stateRegistry.canTransition(resource.state, ResourceState.Ready)) {
            resource.state = ResourceState.Ready;
        }
        this.events.emit('resourceReady', { payload: { resource } });
    }

    private allocate(resource: Resource): void {
        if (resource.state !== ResourceState.Uninitialized) return;
        resource.state = ResourceState.Loading;

        for (const desc of resource.getDescriptors()) {
            if (desc.storage === 'pool' && desc.schema !== undefined) {
                this.allocateInPool(resource, desc, desc.schema);
            } else {
                this.allocateIndividual(resource, desc);
            }
        }

        resource.state = ResourceState.Ready;
        this.events.emit('resourceReady', { payload: { resource } });
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
            this.core.write(spec, resource.data['_initialBytes'] as ArrayBufferView ?? desc.schema.pack(resource.data));
        } else if ((desc.role === 'storage-rw' || desc.role === 'storage-ro') && desc.schema !== undefined) {
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

    private allocateInPool(resource: Resource, desc: GPUDescriptor, schema: Schema): void {
        const poolKey = this.computePoolKey(schema, resource);
        let entry = this.pools.get(poolKey);
        if (entry === undefined) entry = this.createPool(poolKey, schema);

        const entityId = this.world.entityIdOf(resource as unknown as { attached: readonly unknown[] } & object as never);
        const slot = entry.freeList.length > 0
            ? (entry.freeList.shift() as number)
            : entry.count;

        if (slot >= entry.capacity) {
            this.growPool(entry);
        }

        entry.count = Math.max(entry.count, slot + 1);
        if (entityId !== undefined) {
            entry.slotByEntity.set(entityId, slot);
            entry.entityBySlot.set(slot, entityId);
        }

        const bytes = schema.pack(resource.data);
        this.core.write(entry.bufferSpec, bytes, slot * entry.stride);
        // discriminator on the desc keeps this binding distinct in derived bindGroups (no-op here)
        void desc;
    }

    private createPool(poolKey: string, schema: Schema): PoolEntry {
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
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.COMPUTE,
                kind: 'buffer',
                type: 'storage',
            }],
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
            bufferSpec,
            layoutSpec,
            bindGroupSpec,
            capacity,
            count: 0,
            slotByEntity: new Map(),
            entityBySlot: new Map(),
            freeList: [],
            generation: 0,
        };
        this.pools.set(poolKey, entry);
        return entry;
    }

    private growPool(entry: PoolEntry): void {
        const oldCap = entry.capacity;
        const oldByteSize = entry.bufferSpec.byteSize;
        const newCap = oldCap * 2;
        const oldSpec = entry.bufferSpec;
        entry.capacity = newCap;
        entry.bufferSpec = this.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: `pool:${entry.poolKey}:gen${++entry.generation}`,
            byteSize: entry.stride * newCap,
        });
        entry.bindGroupSpec = this.core.create<BindGroupSpec>({
            kind: 'bindgroup',
            discriminator: `pool_bg:${entry.poolKey}:${entry.generation}`,
            layout: entry.layoutSpec,
            bindings: [{ binding: 0, kind: 'buffer', buffer: entry.bufferSpec }],
        });
        // Re-pack all members into the new buffer
        for (const [slot, entityId] of entry.entityBySlot) {
            const resources = this.world.resourcesOf(entityId);
            for (const r of resources) {
                const rSchemaName = (r.constructor as { schema?: { name: string } }).schema?.name;
                if (rSchemaName === entry.schema.name) {
                    const bytes = entry.schema.pack(r.data);
                    this.core.write(entry.bufferSpec, bytes, slot * entry.stride);
                }
            }
        }
        this.core.destroy(oldSpec);
        this.events.emit('poolReallocated', {
            poolKey: entry.poolKey,
            oldByteSize,
            newByteSize: entry.bufferSpec.byteSize,
        });
    }

    private dispose(resource: Resource): void {
        const handler = this.stateRegistry.get(resource.state);
        if (!handler.validTransitions().includes(ResourceState.Disposed)) {
            // already disposed/destroyed/etc.
            return;
        }
        resource.state = ResourceState.Disposed;
        const ind = this.individuals.get(resource);
        if (ind !== undefined) {
            this.core.destroy(ind);
            this.individuals.delete(resource);
        }
        // For pool entries, free the slot
        for (const desc of resource.getDescriptors()) {
            if (desc.storage === 'pool' && desc.schema !== undefined) {
                const poolKey = this.computePoolKey(desc.schema, resource);
                const entry = this.pools.get(poolKey);
                if (entry === undefined) continue;
                const entityId = this.world.entityIdOf(resource as never);
                if (entityId === undefined) continue;
                const slot = entry.slotByEntity.get(entityId);
                if (slot === undefined) continue;
                entry.slotByEntity.delete(entityId);
                entry.entityBySlot.delete(slot);
                entry.freeList.push(slot);
            }
        }
        resource.state = ResourceState.Destroyed;
    }

    private upload(resource: Resource): void {
        const ind = this.individuals.get(resource);
        if (ind !== undefined) {
            const schema = this.schemaForBinding(resource);
            if (schema !== undefined) this.core.write(ind, schema.pack(resource.data));
            return;
        }
        for (const desc of resource.getDescriptors()) {
            if (desc.storage === 'pool' && desc.schema !== undefined) {
                const poolKey = this.computePoolKey(desc.schema, resource);
                const entry = this.pools.get(poolKey);
                if (entry === undefined) continue;
                const entityId = this.world.entityIdOf(resource as never);
                if (entityId === undefined) continue;
                const slot = entry.slotByEntity.get(entityId);
                if (slot === undefined) continue;
                this.core.write(entry.bufferSpec, desc.schema.pack(resource.data), slot * entry.stride);
            }
        }
    }

    private computePoolKey(schema: Schema, resource: Resource): string {
        const flowDescs = resource.getFlowDescriptors?.();
        if (flowDescs !== undefined && flowDescs.length > 0) {
            return `${schema.name}:${flowDescs[0]!.algorithm}`;
        }
        return schema.name;
    }

    private schemaForBinding(resource: Resource): Schema | undefined {
        for (const desc of resource.getDescriptors()) {
            if (desc.schema !== undefined && (desc.role === 'uniform' || desc.role === 'storage-ro' || desc.role === 'storage-rw')) {
                return desc.schema;
            }
        }
        return undefined;
    }

    private identityOf(resource: Resource): string {
        const ctor = resource.constructor as { schema?: { name: string }; name: string };
        const schemaName = ctor.schema?.name ?? ctor.name;
        const id = this.world.entityIdOf(resource as never);
        return id !== undefined ? `${schemaName}#${id}` : `${schemaName}@${(this as { _instanceCounter?: number })._instanceCounter ?? 0}`;
    }
}

function alignUp(value: number, alignment: number): number {
    return Math.ceil(value / alignment) * alignment;
}
