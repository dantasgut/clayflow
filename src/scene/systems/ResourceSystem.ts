import type {
    AnyBufferSpec,
    EngineCore,
    IndexBufferSpec,
    IndirectBufferSpec,
    SamplerSpec,
    StagingBufferSpec,
    StorageBufferSpec,
    TextureSpec,
    TextureViewSpec,
    UniformBufferSpec,
    VertexBufferSpec,
} from '../../core/contracts/index';
import { ResourceState } from '../contracts/ResourceState';
import type { Resource } from '../contracts/Resource';
import type { ResourceDirectory } from '../contracts/ResourceDirectory';
import type { PoolBufferSpec, PoolInfo } from '../contracts/PoolDirectory';
import type { GPUDescriptor } from '../descriptors/GPUDescriptor';
import type { Schema } from '../descriptors/Schema';
import { StructSchema } from '../descriptors/StructSchema';
import type { EventBus, Unsubscribe } from '../events/EventBus';
import { ResourceStateHandlerRegistry } from '../lifecycle/ResourceStateHandlerRegistry';
import type { World } from '../world/World';
import type { EntityId } from '../world/EntityId';
import { makeReactive } from './reactiveData';
import { ConsumerResolverRegistry } from '../consumers/ConsumerResolverRegistry';
import { PoolResolver } from '../consumers/strategies/PoolResolver';
import type { Flow } from '../flows/Flow';
import type { EntityRecordDeclaration, ResourceType } from '../flows/slots';
import type { FlowAllocator, RegisterOptions } from '../flows/FlowRegistry';
import { FlowBinder } from './flowBinding/FlowBinder';
import { LayoutInferencer } from './LayoutInferencer';

type UploadPolicy = NonNullable<GPUDescriptor['upload']>;

interface PoolEntry {
    readonly poolKey: string;
    readonly stride: number;
    readonly schema: Schema;
    readonly upload: UploadPolicy;
    bufferSpec: PoolBufferSpec;
    capacity: number;
    count: number;
    readonly slotByEntity: Map<EntityId, number>;
    readonly entityBySlot: Map<number, EntityId>;
    /** Slot → quem o ocupa (reempacotamento no crescimento). */
    readonly occupants: Map<number, Occupant>;
    readonly freeList: number[];
    generation: number;
}

/** O que a C2 alocou para um descritor individual (não-pool) de um recurso. */
/** Ocupante de um slot de pool: um Resource (dado em `resource.data`) ou um registro de entidade da C2. */
interface Occupant {
    readonly schema: Schema;
    readonly resource?: Resource;
    readonly record?: Readonly<Record<string, number>>;
}

/** Conjunto de registros de entidade (`slot.entities({ record })`), compartilhado pelos Flows que o declaram. */
interface RecordSet {
    readonly declaration: EntityRecordDeclaration;
    readonly all: readonly ResourceType[];
    readonly entry: PoolEntry;
    users: number;
    /** Slots a escrever no próximo `frameRecording`. */
    readonly pending: Set<number>;
}

interface Allocation {
    readonly desc: GPUDescriptor;
    buffer?: AnyBufferSpec;
    texture?: TextureSpec;
    view?: TextureViewSpec;
    sampler?: SamplerSpec;
}

/** Forma de um buffer de geometria derivada do conteúdo. */
interface GeometryShape {
    readonly byteSize: number;
    readonly count: number;
    /** Vértice: bytes por vértice (layout compacto). */
    readonly stride?: number;
    /** Índice: formato pelo tipo do array. */
    readonly format?: GPUIndexFormat;
}

const INITIAL_POOL_CAPACITY = 16;
/** Rodadas máximas de envio por quadro (reações encadeadas a `resourceReady`). */
const MAX_FLUSH_ROUNDS = 16;
/** Bytes por registro de draw indireto indexado (5 × u32) — também cobre os 3 × u32 de dispatch. */
const INDIRECT_RECORD_BYTES = 20;

/**
 * ResourceSystem é a Camada 2 que gerencia o ciclo de vida dos Resources GPU —
 * alocação, envio, crescimento de pools e descarte. Reage a:
 *   - `resourcesChanged` (insert/remove do World) → aloca/descarta;
 *   - `resourceDirty` (automático via dado reativo, ou manual) → enfileira;
 *   - `frameRecording` (antes da gravação do quadro) → envia a fila de sujos, uma vez
 *     por recurso, e emite `resourceReady`;
 *   - `canvasReconfigured` → recria texturas declaradas com `sizeFromCanvas`.
 *
 * **Bag inteira** (research R9): todo descritor de um recurso inserido é alocado, um registro por descritor —
 * uniform/storage (`schema.pack`, todos os `count`), vértice (stride do layout compacto do schema), índice
 * (`uint16`/`uint32` pelo tipo do array), indireto, staging, textura/textura de storage (+ view) e sampler. O
 * que foi alocado é localizado por `ResourceDirectory` (`bufferOf`/`textureOf`/`textureViewOf`/`samplerOf`).
 *
 * **Conteúdo de um descritor de buffer**: `data[desc.id]` se for um typed array (bytes crus — vértices,
 * índices, argumentos indiretos); `data[desc.id]` como array de registros (um por elemento, `count`
 * elementos); senão `schema.pack(data)` para descritores de um elemento. Sem conteúdo, o buffer nasce zerado
 * (produzido pela GPU).
 *
 * **Ciclo de vida** (research R10): toda mudança de estado passa por `transition()`, que lança em transição
 * inválida; as regras vêm do handler do estado (`suppressCpuUpload`, `ignoreDirtyMark`,
 * `reportsIgnoredMutation`). Remover e reinserir a mesma instância é válido (`Destroyed → Uninitialized`).
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
 *   - `individual`: objetos próprios por descritor (Camera, ShadowParams, geometrias).
 *   - `pool`: 1 GPUBuffer de storage compartilhado por N members do mesmo schema, lido como `array<T>` (stride do
 *     struct). Cresce 2× quando a capacidade estoura (destrói o buffer anterior) e emite `poolReallocated`.
 *     Um recurso com vários descritores em pool ocupa o **mesmo slot** em todos eles. `role: 'uniform'` em pool
 *     não é aceito (um registro por desenho viria de offset dinâmico e rebind por draw — ver `slot.entities`
 *     com `record`).
 */
export class ResourceSystem implements ResourceDirectory, FlowAllocator {
    private readonly stateRegistry = new ResourceStateHandlerRegistry();
    private readonly pools = new Map<string, PoolEntry>();
    private readonly allocations = new Map<Resource, Map<string, Allocation>>();
    private readonly allocated = new WeakSet<Resource>();
    private readonly reactive = new WeakSet<Resource>();
    private readonly dirty = new Set<Resource>();
    private readonly warnedGpuManaged = new Set<string>();
    private readonly subscriptions: Unsubscribe[];
    private readonly binder: FlowBinder;
    /** Pools criados na alocação em curso; `poolCreated` sai depois que o recurso ocupa o seu slot. */
    private readonly createdPools: PoolEntry[] = [];
    /** Conjuntos de registros de entidade, pela chave do pool (`schema.name` do registro). */
    private readonly recordSets = new Map<string, RecordSet>();
    private anonCounter = 0;

    /**
     * @param consumers Registro de `consumes` da cena: cada pool criado registra o seu `PoolResolver` (sem substituir
     *   um resolver já registrado com o nome do pool).
     * @param inferencer Inferência de layout usada na preparação dos pipelines dos Flows.
     */
    constructor(
        private readonly core: EngineCore,
        private readonly events: EventBus,
        private readonly world: World,
        readonly consumers: ConsumerResolverRegistry = new ConsumerResolverRegistry(),
        inferencer: LayoutInferencer = new LayoutInferencer(),
    ) {
        this.subscriptions = [
            this.events.on('resourcesChanged', (e) => {
                this.onResourcesChanged(e.added, e.removed);
            }),
            this.events.on('resourceDirty', (e) => {
                this.markDirty(e.payload.resource);
            }),
            this.events.on('entitiesInserted', (e) => {
                for (const set of this.recordSets.values())
                    for (const id of e.entityIds) this.addRecord(set, id);
            }),
            this.events.on('entitiesRemoved', (e) => {
                for (const set of this.recordSets.values())
                    for (const id of e.entityIds) this.removeRecord(set, id);
            }),
            this.events.on('frameRecording', () => {
                this.flushRecords();
                this.flushDirty();
                this.binder.prepareFrame();
                // Escritas de `framePrepare` em recursos da cena (ex.: matriz da luz no ShadowMap) entram no quadro.
                this.flushDirty();
            }),
            this.events.on('canvasReconfigured', (e) => {
                this.resizeCanvasTextures(e.width, e.height);
            }),
        ];
        // Depois das inscrições acima: no redimensionamento, as texturas já estão recriadas quando os Flows reagem.
        this.binder = new FlowBinder({
            core,
            world,
            resources: this,
            consumers,
            events,
            inferencer,
        });
    }

    // ── Flows (FlowAllocator) ────────────────────────────────────────────────

    /**
     * Aloca um Flow: resolve os slots, prepara os pipelines declarados (layout inferido do WGSL, fontes privadas ou
     * de `consumes`), cria layouts e bind groups e emite `flowReady` quando o Flow fica pronto. A partir daí a C2 o
     * mantém: recria bind groups de fontes recriadas (`bindGroupReplaced`) e entrega os eventos às transições dele.
     */
    ensureFlowAllocated(flow: Flow, options: RegisterOptions): void {
        this.binder.ensure(flow, options);
    }

    /** Libera os pipelines e bind groups do Flow, emite `flowSuspended` se estava pronto e o descarta. */
    releaseFlow(flow: Flow): void {
        this.binder.release(flow);
    }

    /**
     * Passa a manter os registros de `declaration` para as entidades com um Resource de cada tipo de `all` (o
     * `record` de um slot `entities`): pool com chave `declaration.schema.name`, um registro por entidade cujos campos
     * são os slots de pool dos descritores nomeados, escrito em lote no `frameRecording`. Conjuntos com a mesma
     * declaração compartilham o pool (contagem de usuários).
     * @throws Error se a chave já é usada por outra declaração, se um campo não está no schema ou se o tipo de um
     *   campo não está em `all`.
     */
    acquireEntityRecords(all: readonly ResourceType[], declaration: EntityRecordDeclaration): void {
        const key = declaration.schema.name;
        const existing = this.recordSets.get(key);
        if (existing !== undefined) {
            if (!sameRecordDeclaration(existing, all, declaration)) {
                throw new Error(
                    `ResourceSystem: registro '${key}' já declarado com outros campos ou outro conjunto de tipos.`,
                );
            }
            existing.users++;
            return;
        }
        for (const [field, [type]] of Object.entries(declaration.fields)) {
            if (!declaration.schema.fields.has(field)) {
                throw new Error(
                    `ResourceSystem: registro '${key}': campo '${field}' fora do schema.`,
                );
            }
            if (!all.includes(type)) {
                throw new Error(
                    `ResourceSystem: registro '${key}': o tipo do campo '${field}' não está no conjunto (all).`,
                );
            }
        }
        const entry =
            this.pools.get(key)
            ?? this.createPool(
                key,
                { id: key, role: 'storage-ro', storage: 'pool', schema: declaration.schema },
                declaration.schema,
            );
        const set: RecordSet = { declaration, all, entry, users: 1, pending: new Set() };
        this.recordSets.set(key, set);
        for (const record of this.world.allRecords()) this.addRecord(set, record.id);
        for (const created of this.createdPools.splice(0)) {
            this.events.emit('poolCreated', { poolKey: created.poolKey, schema: created.schema });
        }
    }

    /** Desfaz um `acquireEntityRecords`; sem usuários, os registros são liberados (o pool fica). */
    releaseEntityRecords(declaration: EntityRecordDeclaration): void {
        const key = declaration.schema.name;
        const set = this.recordSets.get(key);
        if (set === undefined || --set.users > 0) return;
        for (const id of [...set.entry.slotByEntity.keys()]) this.removeRecord(set, id);
        this.recordSets.delete(key);
    }

    hasPool(poolKey: string): boolean {
        return this.pools.has(poolKey);
    }

    /** Desfaz as inscrições no EventBus e descarta os Flows alocados (descarte da cena). */
    dispose(): void {
        this.binder.dispose();
        for (const off of this.subscriptions) off();
        this.subscriptions.length = 0;
    }

    // ── ResourceDirectory ────────────────────────────────────────────────────

    bufferOf(resource: Resource, descId: string): AnyBufferSpec | undefined {
        return this.allocations.get(resource)?.get(descId)?.buffer;
    }

    textureOf(resource: Resource, descId: string): TextureSpec | undefined {
        return this.allocations.get(resource)?.get(descId)?.texture;
    }

    textureViewOf(resource: Resource, descId: string): TextureViewSpec | undefined {
        return this.allocations.get(resource)?.get(descId)?.view;
    }

    samplerOf(resource: Resource, descId: string): SamplerSpec | undefined {
        return this.allocations.get(resource)?.get(descId)?.sampler;
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

    /** Buffer do pool (storage, ou uniform para pools de uniforms). */
    poolBufferSpec(poolKey: string): PoolBufferSpec | undefined {
        return this.pools.get(poolKey)?.bufferSpec;
    }

    poolInfo(poolKey: string): PoolInfo | undefined {
        const entry = this.pools.get(poolKey);
        if (entry === undefined) return undefined;
        return {
            poolKey,
            schema: entry.schema,
            buffer: entry.bufferSpec,
            stride: entry.stride,
            count: entry.count,
            capacity: entry.capacity,
            generation: entry.generation,
        };
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

    // ── Ciclo de vida ────────────────────────────────────────────────────────

    /**
     * Muda o estado de `resource` para `to`, validando contra as transições do handler do estado atual.
     * @throws Error com estado atual, destino e schema quando a transição não é válida.
     */
    transition(resource: Resource, to: ResourceState): void {
        const from = resource.state;
        if (!this.stateRegistry.canTransition(from, to)) {
            throw new Error(
                `ResourceSystem: transição inválida ${from} → ${to} em '${this.schemaNameOf(resource)}'.`,
            );
        }
        resource.state = to;
    }

    private onResourcesChanged(added: readonly Resource[], removed: readonly Resource[]): void {
        for (const r of added) this.allocate(r);
        for (const r of removed) this.release(r);
    }

    // ── Dado reativo e fila de sujos ────────────────────────────────────────

    private markDirty(resource: Resource): void {
        if (!this.allocated.has(resource)) return;
        const handler = this.stateRegistry.get(resource.state);
        if (handler.ignoreDirtyMark()) {
            if (handler.reportsIgnoredMutation()) this.warnIgnoredMutation(resource);
            return;
        }
        this.transition(resource, ResourceState.Dirty);
        this.dirty.add(resource);
    }

    /**
     * Envia os recursos sujos e emite `resourceReady` para cada um, **até a fila esvaziar**: uma reação a
     * `resourceReady` que suja outro recurso (ex.: a matriz da luz gravada no `ShadowMap`) entra no mesmo quadro.
     */
    private flushDirty(): void {
        let rounds = 0;
        while (this.dirty.size > 0) {
            if (++rounds > MAX_FLUSH_ROUNDS) {
                throw new Error(
                    `ResourceSystem: a fila de sujos não esvaziou em ${MAX_FLUSH_ROUNDS} rodadas (ciclo de reações a resourceReady).`,
                );
            }
            const batch = [...this.dirty];
            this.dirty.clear();
            for (const resource of batch) {
                if (!this.allocated.has(resource)) continue;
                if (!this.stateRegistry.get(resource.state).suppressCpuUpload())
                    this.upload(resource);
                this.transition(resource, ResourceState.Ready);
                this.events.emit('resourceReady', { payload: { resource } });
            }
        }
    }

    private installReactiveData(resource: Resource): void {
        if (this.reactive.has(resource)) return;
        this.reactive.add(resource);
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

    private warnIgnoredMutation(resource: Resource): void {
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
        // Reinserção após remoção: a instância volta ao início do ciclo.
        if (resource.state === ResourceState.Destroyed) {
            this.transition(resource, ResourceState.Uninitialized);
        }
        this.transition(resource, ResourceState.Loading);
        this.installReactiveData(resource);

        const descs = resource.getDescriptors();
        const pooled = descs.filter((d) => d.storage === 'pool' && d.schema !== undefined);
        if (pooled.length > 0) this.allocatePooled(resource, pooled);
        const own = new Map<string, Allocation>();
        for (const desc of descs) {
            if (desc.storage === 'pool') continue;
            own.set(desc.id, this.allocateDescriptor(resource, desc));
        }
        if (own.size > 0) this.allocations.set(resource, own);

        this.allocated.add(resource);
        this.transition(resource, ResourceState.Ready);
        if (this.isGpuOwned(descs)) this.transition(resource, ResourceState.GpuManaged);
        this.events.emit('resourceReady', { payload: { resource } });
        for (const entry of this.createdPools.splice(0)) {
            this.events.emit('poolCreated', { poolKey: entry.poolKey, schema: entry.schema });
        }
    }

    /** Recurso cujos descritores materializados são todos 'initial'/'never'. */
    private isGpuOwned(descs: readonly GPUDescriptor[]): boolean {
        const materialized = descs.filter((d) => d.schema !== undefined && isTypedBufferRole(d));
        return materialized.length > 0 && materialized.every((d) => policyOf(d) !== 'always');
    }

    /** Aloca os objetos de GPU de um descritor individual conforme o papel (research R9). */
    private allocateDescriptor(resource: Resource, desc: GPUDescriptor): Allocation {
        const allocation: Allocation = { desc };
        const disc = `${desc.id}:${this.identityOf(resource)}`;
        switch (desc.role) {
            case 'uniform':
            case 'storage-ro':
            case 'storage-rw': {
                if (desc.schema === undefined) break;
                const byteSize = alignUp(desc.schema.stride * (desc.count ?? 1), 16);
                allocation.buffer =
                    desc.role === 'uniform'
                        ? this.core.create<UniformBufferSpec>({
                              kind: 'buffer',
                              subkind: 'uniform',
                              discriminator: disc,
                              byteSize,
                          })
                        : this.core.create<StorageBufferSpec>({
                              kind: 'buffer',
                              subkind: 'storage',
                              discriminator: disc,
                              byteSize,
                          });
                if (policyOf(desc) !== 'never') this.writeBufferContent(resource, allocation);
                break;
            }
            case 'vertex':
            case 'index':
            case 'indirect':
                allocation.buffer = this.createGeometryBuffer(resource, desc);
                if (policyOf(desc) !== 'never') this.writeBufferContent(resource, allocation);
                break;
            case 'staging': {
                const stride = desc.schema?.stride ?? 4;
                allocation.buffer = this.core.create<StagingBufferSpec>({
                    kind: 'buffer',
                    subkind: 'staging',
                    discriminator: disc,
                    byteSize: alignUp(stride * (desc.count ?? 1), 4),
                });
                break;
            }
            case 'texture':
            case 'storage-texture':
                this.createTexture(allocation, disc, this.core.canvasSize());
                break;
            case 'sampler':
                allocation.sampler = this.core.create<SamplerSpec>({
                    kind: 'sampler',
                    discriminator: disc,
                    ...(desc.samplerShape !== undefined ? { desc: { ...desc.samplerShape } } : {}),
                });
                break;
        }
        return allocation;
    }

    /** Forma (tamanho, contagem, formato) do buffer de vértice/índice/indireto para o conteúdo atual. */
    private geometryShape(resource: Resource, desc: GPUDescriptor): GeometryShape {
        const content = rawContent(resource, desc);
        if (desc.role === 'vertex') {
            if (!(desc.schema instanceof StructSchema)) {
                throw new Error(
                    `ResourceSystem: descritor de vértice '${desc.id}' exige StructSchema (layout de vértice).`,
                );
            }
            const stride = desc.schema.vertexLayout.stride;
            const bytes = content?.byteLength ?? stride * (desc.count ?? 0);
            return {
                byteSize: alignUp(Math.max(bytes, 4), 4),
                count: Math.floor(bytes / stride),
                stride,
            };
        }
        if (desc.role === 'index') {
            const format: GPUIndexFormat = content instanceof Uint32Array ? 'uint32' : 'uint16';
            const bytesPerIndex = format === 'uint32' ? 4 : 2;
            const count =
                content !== undefined ? content.byteLength / bytesPerIndex : (desc.count ?? 0);
            return { byteSize: alignUp(Math.max(count * bytesPerIndex, 4), 4), count, format };
        }
        return {
            byteSize: alignUp(content?.byteLength ?? (desc.count ?? 1) * INDIRECT_RECORD_BYTES, 4),
            count: desc.count ?? 1,
        };
    }

    /** Buffer de vértice, índice ou indireto com a forma do conteúdo atual de `data[desc.id]`. */
    private createGeometryBuffer(
        resource: Resource,
        desc: GPUDescriptor,
        shape: GeometryShape = this.geometryShape(resource, desc),
    ): AnyBufferSpec {
        const disc = `${desc.id}:${this.identityOf(resource)}`;
        if (desc.role === 'vertex') {
            return this.core.create<VertexBufferSpec>({
                kind: 'buffer',
                subkind: 'vertex',
                discriminator: disc,
                byteSize: shape.byteSize,
                stride: shape.stride ?? 0,
                count: shape.count,
            });
        }
        if (desc.role === 'index') {
            return this.core.create<IndexBufferSpec>({
                kind: 'buffer',
                subkind: 'index',
                discriminator: disc,
                byteSize: shape.byteSize,
                count: shape.count,
                format: shape.format ?? 'uint16',
            });
        }
        return this.core.create<IndirectBufferSpec>({
            kind: 'buffer',
            subkind: 'indirect',
            discriminator: disc,
            byteSize: shape.byteSize,
        });
    }

    /** Textura (+ view) do descritor; tamanho do `textureShape` ou do canvas (`sizeFromCanvas`). */
    private createTexture(
        allocation: Allocation,
        disc: string,
        canvas: { readonly width: number; readonly height: number } | undefined,
    ): void {
        const desc = allocation.desc;
        const shape = desc.textureShape;
        if (shape === undefined) {
            throw new Error(`ResourceSystem: descritor de textura '${desc.id}' sem textureShape.`);
        }
        const size =
            shape.sizeFromCanvas === true
                ? canvas
                : shape.width !== undefined && shape.height !== undefined
                  ? { width: shape.width, height: shape.height }
                  : undefined;
        if (size === undefined) {
            throw new Error(
                `ResourceSystem: textura '${desc.id}' sem tamanho (width/height ou sizeFromCanvas com canvas).`,
            );
        }
        const format = shape.format === 'canvas' ? this.core.canvasFormat : shape.format;
        const texture = this.core.create<TextureSpec>({
            kind: 'texture',
            discriminator: `${disc}:${size.width}x${size.height}`,
            width: size.width,
            height: size.height,
            format,
            usage: textureUsage(desc.role, format),
            ...(shape.dimension !== undefined ? { dimension: shape.dimension } : {}),
            ...(shape.depthOrArrayLayers !== undefined
                ? { depthOrArrayLayers: shape.depthOrArrayLayers }
                : {}),
            ...(shape.mipLevelCount !== undefined ? { mipLevelCount: shape.mipLevelCount } : {}),
            ...(shape.sampleCount !== undefined ? { sampleCount: shape.sampleCount } : {}),
        });
        allocation.texture = texture;
        allocation.view = this.core.create<TextureViewSpec>({
            kind: 'textureview',
            discriminator: `${disc}:view:${size.width}x${size.height}`,
            source: texture,
            format,
            ...(shape.viewDimension !== undefined ? { dimension: shape.viewDimension } : {}),
        });
    }

    /** Recria as texturas `sizeFromCanvas` com o tamanho novo, destruindo as anteriores. */
    private resizeCanvasTextures(width: number, height: number): void {
        for (const [resource, own] of this.allocations) {
            for (const allocation of own.values()) {
                if (allocation.desc.textureShape?.sizeFromCanvas !== true) continue;
                this.releaseTexture(allocation);
                this.createTexture(
                    allocation,
                    `${allocation.desc.id}:${this.identityOf(resource)}`,
                    { width, height },
                );
            }
        }
    }

    /** Escreve o conteúdo de um descritor de buffer (ver documentação da classe). */
    private writeBufferContent(resource: Resource, allocation: Allocation): void {
        const buffer = allocation.buffer;
        if (buffer === undefined) return;
        const content = bufferContent(resource, allocation.desc);
        if (content === undefined) return;
        this.core.write(buffer, padTo4(content));
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
        if (desc.role === 'uniform') {
            throw new Error(
                `ResourceSystem: descritor '${desc.id}' (${schema.name}) é 'uniform' em pool — pools são de storage, `
                    + "lidos como array<T>: use role 'storage-ro'.",
            );
        }
        // O stride do `array<T>` do WGSL, que é o do struct gerado do schema.
        const stride = schema.stride;
        const capacity = INITIAL_POOL_CAPACITY;
        const entry: PoolEntry = {
            poolKey,
            stride,
            schema,
            upload: policyOf(desc),
            bufferSpec: this.createPoolBuffer(poolKey, stride * capacity, 0),
            capacity,
            count: 0,
            slotByEntity: new Map(),
            entityBySlot: new Map(),
            occupants: new Map(),
            freeList: [],
            generation: 0,
        };
        this.pools.set(poolKey, entry);
        this.consumers.registerDefault(new PoolResolver(poolKey, schema));
        this.createdPools.push(entry);
        return entry;
    }

    private createPoolBuffer(
        poolKey: string,
        byteSize: number,
        generation: number,
    ): PoolBufferSpec {
        const discriminator =
            generation === 0 ? `pool:${poolKey}` : `pool:${poolKey}:gen${generation}`;
        return this.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator,
            byteSize,
        });
    }

    private growPool(entry: PoolEntry): void {
        const oldByteSize = entry.bufferSpec.byteSize;
        const oldSpec = entry.bufferSpec;
        entry.capacity *= 2;
        entry.bufferSpec = this.createPoolBuffer(
            entry.poolKey,
            entry.stride * entry.capacity,
            ++entry.generation,
        );
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
            for (const [slot, occupant] of entry.occupants) {
                this.core.write(
                    entry.bufferSpec,
                    occupant.schema.pack(occupantData(occupant)),
                    slot * entry.stride,
                );
            }
        }
        this.core.destroy(oldSpec);
        this.events.emit('poolReallocated', {
            poolKey: entry.poolKey,
            oldByteSize,
            newByteSize: entry.bufferSpec.byteSize,
        });
    }

    // ── Registros de entidade ────────────────────────────────────────────────

    /** Dá um registro à entidade se ela tem os tipos do conjunto e todos os slots referidos existem. */
    private addRecord(set: RecordSet, id: EntityId): void {
        const entry = set.entry;
        if (entry.slotByEntity.has(id)) return;
        const values = this.recordValues(set, id);
        if (values === undefined) return;
        const slot = this.chooseSlot([entry]);
        const freeIdx = entry.freeList.indexOf(slot);
        if (freeIdx >= 0) entry.freeList.splice(freeIdx, 1);
        while (slot >= entry.capacity) this.growPool(entry);
        for (let s = entry.count; s < slot; s++) {
            if (!entry.occupants.has(s) && !entry.freeList.includes(s)) entry.freeList.push(s);
        }
        entry.count = Math.max(entry.count, slot + 1);
        entry.occupants.set(slot, { schema: entry.schema, record: values });
        entry.slotByEntity.set(id, slot);
        entry.entityBySlot.set(slot, id);
        set.pending.add(slot);
    }

    private removeRecord(set: RecordSet, id: EntityId): void {
        const entry = set.entry;
        const slot = entry.slotByEntity.get(id);
        if (slot === undefined) return;
        entry.slotByEntity.delete(id);
        entry.entityBySlot.delete(slot);
        entry.occupants.delete(slot);
        entry.freeList.push(slot);
        set.pending.delete(slot);
    }

    /** Campos do registro: o slot de pool do descritor nomeado do Resource de cada tipo; `undefined` se faltar algum. */
    private recordValues(set: RecordSet, id: EntityId): Record<string, number> | undefined {
        const resources = this.world.resourcesOf(id);
        if (!set.all.every((type) => resources.some((r) => r instanceof type))) return undefined;
        const values: Record<string, number> = {};
        for (const [field, [type, descId]] of Object.entries(set.declaration.fields)) {
            const resource = resources.find((r) => r instanceof type);
            const desc = resource
                ?.getDescriptors()
                .find((d) => d.id === descId && d.storage === 'pool' && d.schema !== undefined);
            if (resource === undefined || desc?.schema === undefined) return undefined;
            const slot = this.pools
                .get(this.computePoolKey(desc.schema, resource))
                ?.slotByEntity.get(id);
            if (slot === undefined) return undefined;
            values[field] = slot;
        }
        return values;
    }

    /** Escreve os registros pendentes, uma escrita por sequência de slots contíguos. */
    private flushRecords(): void {
        for (const set of this.recordSets.values()) {
            if (set.pending.size === 0) continue;
            const entry = set.entry;
            const slots = [...set.pending].sort((a, b) => a - b);
            set.pending.clear();
            let start = 0;
            while (start < slots.length) {
                let end = start;
                while (end + 1 < slots.length && slots[end + 1] === slots[end]! + 1) end++;
                const first = slots[start]!;
                const bytes = new Uint8Array((end - start + 1) * entry.stride);
                for (let i = start; i <= end; i++) {
                    const occupant = entry.occupants.get(slots[i]!);
                    if (occupant === undefined) continue;
                    set.declaration.schema.packInto(
                        bytes,
                        (slots[i]! - first) * entry.stride,
                        occupantData(occupant),
                    );
                }
                this.core.write(entry.bufferSpec, bytes, first * entry.stride);
                start = end + 1;
            }
        }
    }

    // ── Descarte ─────────────────────────────────────────────────────────────

    private release(resource: Resource): void {
        this.transition(resource, ResourceState.Disposed);
        this.allocated.delete(resource);
        this.dirty.delete(resource);
        const own = this.allocations.get(resource);
        if (own !== undefined) {
            for (const allocation of own.values()) {
                if (allocation.buffer !== undefined) this.core.destroy(allocation.buffer);
                this.releaseTexture(allocation);
                if (allocation.sampler !== undefined) this.core.destroy(allocation.sampler);
            }
            this.allocations.delete(resource);
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
        this.transition(resource, ResourceState.Destroyed);
    }

    private releaseTexture(allocation: Allocation): void {
        if (allocation.view !== undefined) this.core.destroy(allocation.view);
        if (allocation.texture !== undefined) this.core.destroy(allocation.texture);
        delete allocation.view;
        delete allocation.texture;
    }

    // ── Envio ────────────────────────────────────────────────────────────────

    /** Envia os descritores 'always' do recurso (individuais inteiros / pool no slot). */
    private upload(resource: Resource): void {
        const own = this.allocations.get(resource);
        for (const desc of resource.getDescriptors()) {
            if (policyOf(desc) !== 'always') continue;
            if (desc.storage === 'pool') {
                if (desc.schema === undefined) continue;
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
                continue;
            }
            const allocation = own?.get(desc.id);
            if (allocation?.buffer === undefined) continue;
            if (desc.role === 'vertex' || desc.role === 'index' || desc.role === 'indirect') {
                this.refreshGeometryBuffer(resource, allocation);
            } else {
                this.writeBufferContent(resource, allocation);
            }
        }
    }

    /** Reenvia vértices/índices/argumentos; conteúdo de outra forma (tamanho, formato) recria o buffer. */
    private refreshGeometryBuffer(resource: Resource, allocation: Allocation): void {
        const current = allocation.buffer;
        if (current === undefined) return;
        const shape = this.geometryShape(resource, allocation.desc);
        const sameShape =
            shape.byteSize === current.byteSize
            && (current.subkind !== 'index' || current.format === shape.format)
            && (current.subkind !== 'vertex' || current.count === shape.count);
        if (!sameShape) {
            allocation.buffer = this.createGeometryBuffer(resource, allocation.desc, shape);
            this.core.destroy(current);
        }
        this.writeBufferContent(resource, allocation);
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

/** Papéis de buffer tipado por schema (uniform/storage) — os que entram na regra de `GpuManaged`. */
function isTypedBufferRole(desc: GPUDescriptor): boolean {
    return desc.role === 'uniform' || desc.role === 'storage-ro' || desc.role === 'storage-rw';
}

/**
 * Uso de uma textura alocada, derivado do papel e do formato: storage-texture é ligável como storage e amostrável;
 * textura de profundidade/stencil é anexo de render e amostrável (sem cópia — formatos de profundidade não são
 * copiáveis em todos os aspectos); textura de cor é anexo, amostrável e copiável nos dois sentidos.
 */
function textureUsage(role: GPUDescriptor['role'], format: GPUTextureFormat): number {
    const U = GPUTextureUsage;
    if (role === 'storage-texture')
        return U.STORAGE_BINDING | U.TEXTURE_BINDING | U.COPY_SRC | U.COPY_DST;
    if (isDepthOrStencil(format)) return U.RENDER_ATTACHMENT | U.TEXTURE_BINDING;
    return U.TEXTURE_BINDING | U.COPY_DST | U.COPY_SRC | U.RENDER_ATTACHMENT;
}

function isDepthOrStencil(format: GPUTextureFormat): boolean {
    return format.startsWith('depth') || format === 'stencil8';
}

function alignUp(value: number, alignment: number): number {
    return Math.ceil(value / alignment) * alignment;
}

/** `data[desc.id]` quando é um bloco de bytes (typed array/DataView). */
function rawContent(resource: Resource, desc: GPUDescriptor): ArrayBufferView | undefined {
    const value = resource.data[desc.id];
    return ArrayBuffer.isView(value) ? value : undefined;
}

/**
 * Conteúdo de um descritor de buffer: bytes crus em `data[desc.id]`; registros por elemento em
 * `data[desc.id]` (array de objetos, `count` elementos); ou `schema.pack(data)` para um elemento.
 */
function bufferContent(resource: Resource, desc: GPUDescriptor): ArrayBufferView | undefined {
    const raw = rawContent(resource, desc);
    if (raw !== undefined) return raw;
    const schema = desc.schema;
    if (schema === undefined) return undefined;
    const value = resource.data[desc.id];
    if (Array.isArray(value) && value.every((v) => typeof v === 'object' && v !== null)) {
        const records = value as Record<string, unknown>[];
        const count = desc.count ?? records.length;
        const out = new Uint8Array(schema.stride * count);
        records.slice(0, count).forEach((record, i) => {
            const packed = schema.pack(record);
            out.set(
                new Uint8Array(packed.buffer, packed.byteOffset, packed.byteLength),
                i * schema.stride,
            );
        });
        return out;
    }
    if ((desc.count ?? 1) === 1) return schema.pack(resource.data);
    return undefined;
}

/** `writeBuffer` exige tamanho múltiplo de 4: completa com zeros quando necessário. */
function padTo4(view: ArrayBufferView): ArrayBufferView {
    if (view.byteLength % 4 === 0) return view;
    const out = new Uint8Array(alignUp(view.byteLength, 4));
    out.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    return out;
}

function occupantData(occupant: Occupant): Record<string, unknown> {
    return occupant.resource?.data ?? occupant.record ?? {};
}

function sameRecordDeclaration(
    set: RecordSet,
    all: readonly ResourceType[],
    declaration: EntityRecordDeclaration,
): boolean {
    if (set.declaration === declaration) return true;
    const a = Object.entries(set.declaration.fields);
    const b = declaration.fields;
    return (
        set.declaration.schema === declaration.schema
        && set.all.length === all.length
        && set.all.every((t) => all.includes(t))
        && a.length === Object.keys(b).length
        && a.every(([k, [t, d]]) => b[k]?.[0] === t && b[k][1] === d)
    );
}
