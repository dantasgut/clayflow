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
import { FieldType } from '../descriptors/FieldType';
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
    /** Slot → quem o ocupa (dado empacotado no envio). */
    readonly occupants: Map<number, Occupant>;
    /** Resource → slot: localização O(1) no envio e na liberação. */
    readonly slotOfResource: Map<Resource, number>;
    readonly freeList: number[];
    generation: number;
    /** Slots com dado da CPU a enviar no próximo envio (bitset de `capacity` bits). */
    dirtyBits: Uint32Array;
    /** Campos de topo mudados nos slots marcados desde o último envio (`undefined` = todos ou desconhecidos). */
    changedFields: Set<string> | undefined;
    /** O pool está na fila de envio (`dirtyPools`). */
    queued: boolean;
    /** Slots já escritos desde que foram ocupados (o primeiro envio de um slot de posse da GPU ainda sai). */
    writtenBits: Uint32Array;
    /** Slots de posse da GPU (`slot.entities({ owns })`): a CPU não os escreve depois do primeiro envio. */
    ownedBits: Uint32Array;
    /** Dono (conjunto que declarou `owns`) de cada slot de posse da GPU. */
    readonly owners: Map<number, object>;
}

/**
 * Plano de envio de um Resource alocado, calculado na alocação: os slots dos seus descritores `'always'` em pool e se ele
 * tem descritores próprios — o envio por quadro não relê os descritores nem recalcula chaves de pool. Guardado no
 * próprio Resource sob um símbolo privado da C2 (um Resource está em uma cena por vez).
 */
const UPLOAD_PLAN = Symbol('clayflow.uploadPlan');

function planOf(resource: Resource): UploadPlan | undefined {
    return (resource as { [UPLOAD_PLAN]?: UploadPlan })[UPLOAD_PLAN];
}

function setPlan(resource: Resource, plan: UploadPlan | undefined): void {
    (resource as { [UPLOAD_PLAN]?: UploadPlan | undefined })[UPLOAD_PLAN] = plan;
}

/** Dado cru (sem o proxy reativo) do Resource, sob um símbolo privado da C2: o empacotamento lê dele. */
const RAW_DATA = Symbol('clayflow.rawData');

function rawDataOf(resource: Resource): Record<string, unknown> | undefined {
    return (resource as { [RAW_DATA]?: Record<string, unknown> })[RAW_DATA];
}

function setRawData(resource: Resource, data: Record<string, unknown>): void {
    (resource as { [RAW_DATA]?: Record<string, unknown> })[RAW_DATA] = data;
}

/** Plano de envio de um Resource (ver `UPLOAD_PLAN`). */
interface UploadPlan {
    /** Pools dos descritores `'always'` em pool (o slot é o do Resource em cada um). */
    readonly pools: readonly {
        readonly entry: PoolEntry;
        readonly descId: string;
        /** Slot do Resource no pool (estável enquanto alocado; um Resource ocupa o mesmo slot em todos). */
        readonly slot: number;
    }[];
    /** Tem descritores próprios (enviados inteiros). */
    readonly own: boolean;
}

/** Pedido de leitura de um Resource (`ResourceSystem.read`). */
interface PendingRead {
    readonly resource: Resource;
    readonly descId: string | undefined;
    readonly resolve: (data: Record<string, unknown> | undefined) => void;
}

/** Leitura localizada: fonte, slot, stride e schema, com o pedido. */
interface ReadItem {
    readonly source: AnyBufferSpec;
    readonly stride: number;
    readonly slot: number;
    readonly schema: StructSchema;
    readonly request: PendingRead;
}

/** O que a C2 alocou para um descritor individual (não-pool) de um recurso. */
/** Ocupante de um slot de pool: um Resource (dado em `resource.data`) ou um registro de entidade da C2. */
interface Occupant {
    readonly schema: Schema;
    readonly resource?: Resource;
    readonly record?: Readonly<Record<string, number>>;
    /**
     * Dado de `upload: 'initial'` empacotado na alocação, à espera do envio: o que vale é o dado do momento da inserção
     * (mutações depois dela são ignoradas, a GPU é dona).
     */
    initial?: Uint8Array;
}

/** Conjunto de registros de entidade (`slot.entities({ record })`), compartilhado pelos Flows que o declaram. */
interface RecordSet {
    readonly declaration: EntityRecordDeclaration;
    readonly all: readonly ResourceType[];
    readonly entry: PoolEntry;
    users: number;
}

interface Allocation {
    readonly desc: GPUDescriptor;
    buffer?: AnyBufferSpec;
    /** Chave do buffer de geometria compartilhado por conteúdo (spec 007, R1), quando a alocação é compartilhada. */
    sharedKey?: string;
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
 *   - `frameRecording` (antes da gravação do quadro) → envia a fila de sujos: objetos próprios inteiros (com
 *     `resourceReady`) e dados em pool por faixas contíguas de slots (com um `poolWritten` por pool);
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
 *     struct). Cresce 2× quando a capacidade estoura — o conteúdo vai para o buffer novo por cópia na GPU, sem
 *     reempacotar na CPU — e emite `poolReallocated`. **Envio por delta** (spec 007, R5): alocação e mutação só
 *     marcam o slot (bitset do pool, slot achado em O(1)); no envio, cada faixa contígua de slots marcados é
 *     empacotada numa área reutilizável e escrita com um `core.write`.
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
    private dirty = new Set<Resource>();
    /** Pools com slots marcados para o próximo envio. */
    private readonly dirtyPools = new Set<PoolEntry>();
    /** Listas de instâncias (`slot.entities({ groups })`) por chave: campo `u32` e usuários. */
    private readonly instanceLists = new Map<string, { readonly field: string; users: number }>();
    /** Leituras pedidas desde o último lote (agrupadas e copiadas numa microtarefa). */
    private readonly pendingReads: PendingRead[] = [];
    private readsScheduled = false;
    private readBatch = 0;
    /** Resources cuja mutação foi ignorada por posse da GPU (aviso uma vez por Resource). */
    private readonly warnedOwned = new WeakSet<Resource>();
    /** Buffers de vértice/índice compartilhados por chave de conteúdo: o spec e quantas alocações o usam. */
    private readonly sharedGeometry = new Map<string, { spec: AnyBufferSpec; users: number }>();
    /** Área de empacotamento reutilizada pelas faixas do envio. */
    private scratch = new ArrayBuffer(0);
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
        const set: RecordSet = { declaration, all, entry, users: 1 };
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

    /**
     * Passa a manter a lista de instâncias com o schema dado (`slot.entities({ groups })`): pool com chave
     * `schema.name`, um `u32` por posição. Conjuntos com o mesmo schema compartilham a lista (contagem de usuários).
     * @throws Error se o schema não tem exatamente um campo `u32`.
     */
    acquireInstanceList(schema: StructSchema): void {
        const key = schema.name;
        const existing = this.instanceLists.get(key);
        if (existing !== undefined) {
            existing.users++;
            return;
        }
        const fields = [...schema.fields.entries()];
        if (fields.length !== 1 || fields[0]![1] !== FieldType.u32) {
            throw new Error(
                `ResourceSystem: lista de instâncias '${key}' exige um schema com um único campo u32.`,
            );
        }
        this.instanceLists.set(key, { field: fields[0]![0], users: 1 });
        if (!this.pools.has(key)) {
            this.createPool(key, { id: key, role: 'storage-ro', storage: 'pool', schema }, schema);
            for (const created of this.createdPools.splice(0)) {
                this.events.emit('poolCreated', {
                    poolKey: created.poolKey,
                    schema: created.schema,
                });
            }
        }
    }

    /** Desfaz um `acquireInstanceList`; sem usuários, as posições são liberadas (o pool fica). */
    releaseInstanceList(schema: StructSchema): void {
        const list = this.instanceLists.get(schema.name);
        if (list === undefined || --list.users > 0) return;
        this.instanceLists.delete(schema.name);
        const entry = this.pools.get(schema.name);
        if (entry === undefined) return;
        for (const slot of [...entry.occupants.keys()]) this.clearInstance(schema.name, slot);
    }

    /** Escreve `value` na posição `index` da lista de instâncias (enviado em faixas no próximo envio). */
    setInstance(poolKey: string, index: number, value: number): void {
        const list = this.instanceLists.get(poolKey);
        const entry = this.pools.get(poolKey);
        if (list === undefined || entry === undefined) {
            throw new Error(`ResourceSystem: lista de instâncias '${poolKey}' não adquirida.`);
        }
        while (index >= entry.capacity) this.growPool(entry);
        entry.count = Math.max(entry.count, index + 1);
        entry.occupants.set(index, { schema: entry.schema, record: { [list.field]: value } });
        this.markSlot(entry, index);
    }

    /** Libera a posição `index` da lista de instâncias. */
    clearInstance(poolKey: string, index: number): void {
        const entry = this.pools.get(poolKey);
        if (entry === undefined) return;
        entry.occupants.delete(index);
        this.clearSlot(entry, index);
        clearBit(entry.writtenBits, index);
    }

    /**
     * Passa à GPU a posse do descritor `descId` (em pool) de `resource`, em nome de `owner` (`slot.entities({ owns })`):
     * depois do primeiro envio a CPU não escreve mais o slot e mutação é ignorada com aviso único por Resource; o
     * crescimento do pool preserva o dado por cópia na GPU.
     * @throws Error se outro dono já tem a posse do mesmo slot.
     */
    acquireOwnership(owner: object, resource: Resource, descId: string): void {
        const located = this.poolSlotOfDescriptor(resource, descId);
        if (located === undefined) return;
        const { entry, slot } = located;
        const current = entry.owners.get(slot);
        if (current !== undefined && current !== owner) {
            throw new Error(
                `ResourceSystem: o descritor '${descId}' de '${this.schemaNameOf(resource)}' já tem dono na GPU `
                    + '(dois conjuntos declaram owns sobre o mesmo dado).',
            );
        }
        entry.owners.set(slot, owner);
        setBit(entry.ownedBits, slot);
    }

    /** Devolve à CPU a posse tomada por `owner`; o dado de intenção é reenviado no próximo envio. */
    releaseOwnership(owner: object, resource: Resource, descId: string): void {
        const located = this.poolSlotOfDescriptor(resource, descId);
        if (located === undefined) return;
        const { entry, slot } = located;
        if (entry.owners.get(slot) !== owner) return;
        entry.owners.delete(slot);
        clearBit(entry.ownedBits, slot);
        this.markSlot(entry, slot);
    }

    /** Chave do pool do descritor `descId` de `resource` (com algoritmo, quando declarado), ou `undefined`. */
    poolKeyOf(resource: Resource, descId: string): string | undefined {
        const desc = resource
            .getDescriptors()
            .find((d) => d.id === descId && d.storage === 'pool' && d.schema !== undefined);
        return desc?.schema === undefined ? undefined : this.computePoolKey(desc.schema, resource);
    }

    private poolSlotOfDescriptor(
        resource: Resource,
        descId: string,
    ): { entry: PoolEntry; slot: number } | undefined {
        const poolKey = this.poolKeyOf(resource, descId);
        const entry = poolKey === undefined ? undefined : this.pools.get(poolKey);
        const slot = entry?.slotOfResource.get(resource);
        return entry === undefined || slot === undefined ? undefined : { entry, slot };
    }

    /**
     * Lê da GPU o dado de `resource` (o descritor `descId`, ou o primeiro com schema) e o devolve desempacotado pelo
     * schema — o caminho para a CPU ver um dado de posse da GPU (ex.: a pose de um corpo). Os pedidos da mesma
     * tarefa são agrupados: uma cópia por faixa contígua de slots de cada pool, um envio e uma leitura de volta; a
     * cópia entra depois do trabalho já enviado, então o valor é o do último quadro enviado. Resource fora da cena (ou
     * removido antes da resposta) resolve `undefined`. Nenhuma leitura acontece sem pedido.
     */
    read(resource: Resource, descId?: string): Promise<Record<string, unknown> | undefined> {
        return new Promise((resolve) => {
            this.pendingReads.push({ resource, descId, resolve });
            if (this.readsScheduled) return;
            this.readsScheduled = true;
            queueMicrotask(() => {
                this.flushReads();
            });
        });
    }

    /** `read` de vários Resources, num lote só. */
    readAll(
        resources: readonly Resource[],
        descId?: string,
    ): Promise<(Record<string, unknown> | undefined)[]> {
        return Promise.all(resources.map((r) => this.read(r, descId)));
    }

    /** Copia os pedidos pendentes para um staging (faixas contíguas por fonte), lê de volta e desempacota. */
    private flushReads(): void {
        this.readsScheduled = false;
        const requests = this.pendingReads.splice(0);
        const bySource = new Map<AnyBufferSpec, { stride: number; items: ReadItem[] }>();
        for (const request of requests) {
            const target = this.readTarget(request.resource, request.descId);
            if (target === undefined) {
                request.resolve(undefined);
                continue;
            }
            let group = bySource.get(target.source);
            if (group === undefined) {
                group = { stride: target.stride, items: [] };
                bySource.set(target.source, group);
            }
            group.items.push({ ...target, request });
        }
        if (bySource.size === 0) return;
        const copies: {
            source: AnyBufferSpec;
            srcOffset: number;
            dstOffset: number;
            size: number;
        }[] = [];
        const placed: { item: ReadItem; dstOffset: number }[] = [];
        let total = 0;
        for (const [source, { stride, items }] of bySource) {
            const slots = [...new Set(items.map((i) => i.slot))].sort((a, b) => a - b);
            const dstOfSlot = new Map<number, number>();
            let k = 0;
            while (k < slots.length) {
                let end = k;
                while (end + 1 < slots.length && slots[end + 1] === slots[end]! + 1) end++;
                const size = (end - k + 1) * stride;
                copies.push({ source, srcOffset: slots[k]! * stride, dstOffset: total, size });
                for (let j = k; j <= end; j++) dstOfSlot.set(slots[j]!, total + (j - k) * stride);
                total += size;
                k = end + 1;
            }
            for (const item of items) placed.push({ item, dstOffset: dstOfSlot.get(item.slot)! });
        }
        const staging = this.core.create<StagingBufferSpec>({
            kind: 'buffer',
            subkind: 'staging',
            discriminator: `read:${this.readBatch++}`,
            byteSize: alignUp(total, 4),
        });
        this.core.record('resource_read', (frame) => {
            for (const c of copies) frame.copy(c.source, staging, c.size, c.srcOffset, c.dstOffset);
        });
        this.core.submit();
        void this.core.readback(staging).then(
            (bytes) => {
                this.core.destroy(staging);
                for (const { item, dstOffset } of placed) {
                    const alive = this.allocated.has(item.request.resource);
                    item.request.resolve(alive ? item.schema.unpack(bytes, dstOffset) : undefined);
                }
            },
            () => {
                this.core.destroy(staging);
                for (const { item } of placed) item.request.resolve(undefined);
            },
        );
    }

    /** Fonte, slot e schema da leitura: slot do pool, ou o buffer individual inteiro (slot 0). */
    private readTarget(
        resource: Resource,
        descId: string | undefined,
    ): Omit<ReadItem, 'request'> | undefined {
        if (!this.allocated.has(resource)) return undefined;
        const desc = resource
            .getDescriptors()
            .find(
                (d) =>
                    (descId === undefined || d.id === descId)
                    && d.schema instanceof StructSchema
                    && isTypedBufferRole(d),
            );
        const schema = desc?.schema;
        if (desc === undefined || !(schema instanceof StructSchema)) return undefined;
        if (desc.storage === 'pool') {
            const entry = this.pools.get(this.computePoolKey(schema, resource));
            const slot = entry?.slotOfResource.get(resource);
            if (entry === undefined || slot === undefined) return undefined;
            return { source: entry.bufferSpec, stride: entry.stride, slot, schema };
        }
        const buffer = this.allocations.get(resource)?.get(desc.id)?.buffer;
        if (buffer === undefined) return undefined;
        return { source: buffer, stride: alignUp(schema.stride, 4), slot: 0, schema };
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

    /** O slot do pool é de posse da GPU (`acquireOwnership`)? */
    poolSlotOwnedByGpu(poolKey: string, slot: number): boolean {
        const entry = this.pools.get(poolKey);
        return entry !== undefined && hasBit(entry.ownedBits, slot);
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
            gpuOwned: entry.owners.size,
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
        // Pools novos são anunciados depois de a inserção inteira estar alocada: um Flow instanciado pelo
        // `poolCreated` (ex.: o solver do corpo) já encontra os pools dos outros Resources da mesma entidade.
        for (const entry of this.createdPools.splice(0)) {
            this.events.emit('poolCreated', { poolKey: entry.poolKey, schema: entry.schema });
        }
        for (const r of removed) this.release(r);
    }

    // ── Dado reativo e fila de sujos ────────────────────────────────────────

    /**
     * Mutação em `resource.data` (campo de topo `field`, ou todos): os slots dos seus pools são marcados na hora, com o
     * campo (o envio é por faixas, no `frameRecording`); objetos próprios entram na fila de envio inteiro.
     */
    private markDirty(resource: Resource, field?: string): void {
        // O plano existe enquanto o Resource está alocado (campo no próprio objeto: sem consulta a mapa por mutação).
        const plan = planOf(resource);
        if (plan === undefined) return;
        const state = resource.state;
        if (state !== ResourceState.Ready && state !== ResourceState.Dirty) {
            const handler = this.stateRegistry.get(state);
            if (handler.ignoreDirtyMark()) {
                if (handler.reportsIgnoredMutation()) this.warnIgnoredMutation(resource);
                return;
            }
        }
        // Só objetos próprios passam pela fila (e pelo estado Dirty); dado em pool vai pelo slot marcado abaixo.
        if (plan.own && state !== ResourceState.Dirty) {
            this.transition(resource, ResourceState.Dirty);
            this.dirty.add(resource);
        }
        for (const { entry, descId, slot } of plan.pools) {
            if (hasBit(entry.ownedBits, slot) && hasBit(entry.writtenBits, slot)) {
                this.warnOwnedMutation(resource, descId);
                continue;
            }
            this.markSlot(entry, slot, field);
        }
    }

    /**
     * Envia os recursos sujos **até a fila esvaziar**: objetos próprios inteiros (com `resourceReady`) e os slots
     * marcados dos pools por faixas contíguas (com um `poolWritten` por pool). Uma reação a um desses eventos que suje
     * outro recurso (ex.: a matriz da luz gravada no `ShadowMap`) entra no mesmo quadro.
     */
    private flushDirty(): void {
        let rounds = 0;
        while (this.dirty.size > 0 || this.dirtyPools.size > 0) {
            if (++rounds > MAX_FLUSH_ROUNDS) {
                throw new Error(
                    `ResourceSystem: a fila de sujos não esvaziou em ${MAX_FLUSH_ROUNDS} rodadas (ciclo de reações a resourceReady/poolWritten).`,
                );
            }
            if (this.dirty.size === 0) {
                // Recursos drenados: os pools vão de uma vez, com o que as reações sujaram na mesma faixa.
                this.flushPools();
                continue;
            }
            // Troca de filas (sem cópia): reações durante o envio entram nas novas.
            const batch = this.dirty;
            this.dirty = new Set();
            for (const resource of batch) {
                if (!this.allocated.has(resource)) continue;
                // Os slots de pool já foram marcados na mutação; aqui só os objetos próprios.
                if (!this.stateRegistry.get(resource.state).suppressCpuUpload())
                    this.uploadOwn(resource);
                this.transition(resource, ResourceState.Ready);
                if (this.allocations.has(resource))
                    this.events.emit('resourceReady', { payload: { resource } });
            }
        }
    }

    /** Dado do ocupante para empacotar: o dado cru do Resource (sem o proxy reativo) ou o registro da C2. */
    private occupantData(occupant: Occupant): Record<string, unknown> {
        const resource = occupant.resource;
        if (resource === undefined) return occupant.record ?? {};
        return rawDataOf(resource) ?? resource.data;
    }

    /**
     * Marca o slot para o próximo envio, com os campos de topo mudados (`undefined` = todos), que o `poolWritten`
     * do pool agrega.
     */
    private markSlot(entry: PoolEntry, slot: number, field?: string): void {
        if (!entry.queued) {
            entry.queued = true;
            this.dirtyPools.add(entry);
            entry.changedFields = field === undefined ? undefined : new Set([field]);
        } else if (field === undefined) entry.changedFields = undefined;
        else entry.changedFields?.add(field);
        const word = slot >>> 5;
        entry.dirtyBits[word] = (entry.dirtyBits[word] ?? 0) | (1 << (slot & 31));
    }

    private clearSlot(entry: PoolEntry, slot: number): void {
        const word = slot >>> 5;
        entry.dirtyBits[word] = (entry.dirtyBits[word] ?? 0) & ~(1 << (slot & 31));
    }

    /**
     * Envia os slots marcados de cada pool: percorre o bitset em ordem, junta faixas contíguas, empacota os ocupantes
     * de cada faixa na área reutilizável e faz uma escrita por faixa; depois emite `poolWritten` com as faixas.
     */
    private flushPools(): void {
        const pools = [...this.dirtyPools];
        this.dirtyPools.clear();
        for (const entry of pools) {
            entry.queued = false;
            const ranges: [number, number][] = [];
            const bits = entry.dirtyBits;
            let runStart = -1;
            let runEnd = -1;
            for (let word = 0; word < bits.length; word++) {
                let w = bits[word]!;
                if (w === 0) continue;
                bits[word] = 0;
                while (w !== 0) {
                    const bit = 31 - Math.clz32(w & -w);
                    w &= w - 1;
                    const slot = (word << 5) | bit;
                    if (!entry.occupants.has(slot)) continue;
                    // Posse da GPU: só o primeiro envio do slot sai da CPU.
                    if (hasBit(entry.ownedBits, slot) && hasBit(entry.writtenBits, slot)) continue;
                    if (runStart >= 0 && slot === runEnd + 1) {
                        runEnd = slot;
                        continue;
                    }
                    if (runStart >= 0) this.writeRun(entry, runStart, runEnd, ranges);
                    runStart = runEnd = slot;
                }
            }
            if (runStart >= 0) this.writeRun(entry, runStart, runEnd, ranges);
            const fields = entry.changedFields;
            entry.changedFields = undefined;
            if (ranges.length > 0) {
                this.events.emit('poolWritten', {
                    poolKey: entry.poolKey,
                    schema: entry.schema,
                    ranges,
                    ...(fields !== undefined ? { fields: [...fields] } : {}),
                });
            }
        }
    }

    /** Empacota os ocupantes de `first..last` e os escreve com um `core.write`. */
    private writeRun(
        entry: PoolEntry,
        first: number,
        last: number,
        ranges: [number, number][],
    ): void {
        const count = last - first + 1;
        const bytes = count * entry.stride;
        if (this.scratch.byteLength < bytes)
            this.scratch = new ArrayBuffer(Math.max(bytes, this.scratch.byteLength * 2));
        for (let slot = first; slot <= last; slot++) {
            const occupant = entry.occupants.get(slot)!;
            const offset = (slot - first) * entry.stride;
            const schema = occupant.schema;
            if (occupant.initial !== undefined) {
                new Uint8Array(this.scratch, offset, entry.stride).set(occupant.initial);
                delete occupant.initial;
            } else if (schema instanceof StructSchema) {
                schema.packInto(this.scratch, offset, this.occupantData(occupant));
            } else {
                const packed = schema.pack(this.occupantData(occupant));
                new Uint8Array(this.scratch, offset, entry.stride).set(
                    new Uint8Array(packed.buffer, packed.byteOffset, packed.byteLength),
                );
            }
        }
        this.core.write(
            entry.bufferSpec,
            new Uint8Array(this.scratch, 0, bytes),
            first * entry.stride,
        );
        for (let slot = first; slot <= last; slot++) setBit(entry.writtenBits, slot);
        ranges.push([first, count]);
    }

    private installReactiveData(resource: Resource): void {
        if (this.reactive.has(resource)) return;
        this.reactive.add(resource);
        const onChange = (field: string | undefined): void => {
            this.markDirty(resource, field);
        };
        setRawData(resource, resource.data);
        let proxied = makeReactive(resource.data, onChange);
        Object.defineProperty(resource, 'data', {
            configurable: true,
            enumerable: true,
            get: () => proxied,
            set: (next: Record<string, unknown>) => {
                setRawData(resource, next);
                proxied = makeReactive(next, onChange);
                onChange(undefined);
            },
        });
    }

    private warnOwnedMutation(resource: Resource, descId: string): void {
        if (this.warnedOwned.has(resource)) return;
        this.warnedOwned.add(resource);
        const id = this.world.entityIdOfResource(resource);
        console.warn(
            `[ResourceSystem] Mutação ignorada em '${this.schemaNameOf(resource)}' (descritor '${descId}', entidade `
                + `${id ?? '?'}): a GPU é dona deste dado (owns). Leia-o com world.read.`,
        );
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
        setPlan(resource, {
            pools: planOf(resource)?.pools ?? [],
            own: own.size > 0,
        });

        this.allocated.add(resource);
        this.transition(resource, ResourceState.Ready);
        if (this.isGpuOwned(descs)) this.transition(resource, ResourceState.GpuManaged);
        // Dado em pool é anunciado no envio (`poolWritten`); `resourceReady` é dos objetos próprios.
        if (own.size > 0) this.events.emit('resourceReady', { payload: { resource } });
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
            case 'indirect': {
                const key = this.sharedGeometryKey(resource, desc);
                if (key !== undefined) {
                    this.acquireSharedGeometry(resource, allocation, key);
                    break;
                }
                allocation.buffer = this.createGeometryBuffer(resource, desc);
                if (policyOf(desc) !== 'never') this.writeBufferContent(resource, allocation);
                break;
            }
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

    /**
     * Chave do buffer compartilhado de um descritor de vértice/índice com conteúdo da CPU: `${id}:${schema}:${contentKey}`;
     * `undefined` sem `contentKey`, para outros papéis ou para dado produzido na GPU (`'never'`).
     */
    private sharedGeometryKey(resource: Resource, desc: GPUDescriptor): string | undefined {
        if (desc.role !== 'vertex' && desc.role !== 'index') return undefined;
        if (policyOf(desc) === 'never') return undefined;
        const contentKey = resource.contentKey;
        if (contentKey === undefined) return undefined;
        return `${desc.id}:${desc.schema?.name ?? desc.role}:${contentKey}`;
    }

    /** Usa o buffer da chave (criado e escrito só pelo primeiro usuário). */
    private acquireSharedGeometry(resource: Resource, allocation: Allocation, key: string): void {
        let shared = this.sharedGeometry.get(key);
        if (shared === undefined) {
            const spec = this.createGeometryBuffer(
                resource,
                allocation.desc,
                undefined,
                `shared:${key}`,
            );
            shared = { spec, users: 0 };
            this.sharedGeometry.set(key, shared);
            allocation.buffer = spec;
            this.writeBufferContent(resource, allocation);
        }
        shared.users++;
        allocation.buffer = shared.spec;
        allocation.sharedKey = key;
    }

    /** Solta o buffer compartilhado da alocação; o último usuário o destrói. */
    private releaseSharedGeometry(allocation: Allocation): void {
        const key = allocation.sharedKey;
        if (key === undefined) return;
        delete allocation.sharedKey;
        const shared = this.sharedGeometry.get(key);
        if (shared === undefined) return;
        if (--shared.users > 0) return;
        this.sharedGeometry.delete(key);
        this.core.destroy(shared.spec);
    }

    /** Buffer de vértice, índice ou indireto com a forma do conteúdo atual de `data[desc.id]`. */
    private createGeometryBuffer(
        resource: Resource,
        desc: GPUDescriptor,
        shape: GeometryShape = this.geometryShape(resource, desc),
        discriminator?: string,
    ): AnyBufferSpec {
        const disc = discriminator ?? `${desc.id}:${this.identityOf(resource)}`;
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
        setPlan(resource, {
            pools: entries
                .filter(({ desc }) => policyOf(desc) === 'always')
                .map(({ desc, entry }) => ({ entry, descId: desc.id, slot })),
            own: planOf(resource)?.own ?? false,
        });
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
            entry.occupants.set(slot, {
                resource,
                schema,
                ...(policyOf(desc) === 'initial'
                    ? { initial: bytesOf(schema.pack(resource.data)) }
                    : {}),
            });
            entry.slotOfResource.set(resource, slot);
            if (entityId !== undefined) {
                entry.slotByEntity.set(entityId, slot);
                entry.entityBySlot.set(slot, entityId);
            }
            // O dado inicial vai no próximo envio, junto com os vizinhos (faixas contíguas).
            if (policyOf(desc) !== 'never') this.markSlot(entry, slot);
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
            slotOfResource: new Map(),
            freeList: [],
            generation: 0,
            dirtyBits: new Uint32Array(Math.ceil(capacity / 32)),
            changedFields: undefined,
            queued: false,
            writtenBits: new Uint32Array(Math.ceil(capacity / 32)),
            ownedBits: new Uint32Array(Math.ceil(capacity / 32)),
            owners: new Map(),
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
        // O conteúdo vai para o buffer novo por cópia na GPU — o que a GPU produziu (simulação, posse da GPU) e o que a
        // CPU já enviou; slots ainda marcados são escritos no buffer novo no próximo envio. Pools 'never' só
        // realocam: o produtor recalcula ao receber `poolReallocated`. A cópia grava um comando próprio: crescer
        // durante a gravação de um quadro não é suportado (alocações ocorrem fora da gravação).
        if (entry.upload !== 'never') {
            const target = entry.bufferSpec;
            this.core.record(`pool_grow:${entry.poolKey}`, (frame) => {
                frame.copy(oldSpec, target, oldByteSize);
            });
            this.core.submit();
        }
        entry.dirtyBits = grownBits(entry.dirtyBits, entry.capacity);
        entry.writtenBits = grownBits(entry.writtenBits, entry.capacity);
        entry.ownedBits = grownBits(entry.ownedBits, entry.capacity);
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
        this.markSlot(entry, slot);
    }

    private removeRecord(set: RecordSet, id: EntityId): void {
        const entry = set.entry;
        const slot = entry.slotByEntity.get(id);
        if (slot === undefined) return;
        entry.slotByEntity.delete(id);
        entry.entityBySlot.delete(slot);
        entry.occupants.delete(slot);
        entry.freeList.push(slot);
        this.clearSlot(entry, slot);
        clearBit(entry.writtenBits, slot);
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

    // ── Descarte ─────────────────────────────────────────────────────────────

    private release(resource: Resource): void {
        this.transition(resource, ResourceState.Disposed);
        this.allocated.delete(resource);
        this.dirty.delete(resource);
        const own = this.allocations.get(resource);
        if (own !== undefined) {
            for (const allocation of own.values()) {
                if (allocation.sharedKey !== undefined) this.releaseSharedGeometry(allocation);
                else if (allocation.buffer !== undefined) this.core.destroy(allocation.buffer);
                this.releaseTexture(allocation);
                if (allocation.sampler !== undefined) this.core.destroy(allocation.sampler);
            }
            this.allocations.delete(resource);
        }
        for (const desc of resource.getDescriptors()) {
            if (desc.storage !== 'pool' || desc.schema === undefined) continue;
            const entry = this.pools.get(this.computePoolKey(desc.schema, resource));
            const slot = entry?.slotOfResource.get(resource);
            if (entry === undefined || slot === undefined) continue;
            entry.slotOfResource.delete(resource);
            entry.occupants.delete(slot);
            const eid = entry.entityBySlot.get(slot);
            if (eid !== undefined) entry.slotByEntity.delete(eid);
            entry.entityBySlot.delete(slot);
            entry.freeList.push(slot);
            this.clearSlot(entry, slot);
            clearBit(entry.writtenBits, slot);
            clearBit(entry.ownedBits, slot);
            entry.owners.delete(slot);
        }
        setPlan(resource, undefined);
        this.transition(resource, ResourceState.Destroyed);
    }

    private releaseTexture(allocation: Allocation): void {
        if (allocation.view !== undefined) this.core.destroy(allocation.view);
        if (allocation.texture !== undefined) this.core.destroy(allocation.texture);
        delete allocation.view;
        delete allocation.texture;
    }

    // ── Envio ────────────────────────────────────────────────────────────────

    /** Envia inteiros os descritores próprios `'always'` do recurso (os de pool são marcados na mutação). */
    private uploadOwn(resource: Resource): void {
        const plan = planOf(resource);
        if (plan?.own !== true) return;
        const own = this.allocations.get(resource);
        for (const desc of resource.getDescriptors()) {
            if (policyOf(desc) !== 'always' || desc.storage === 'pool') continue;
            const allocation = own?.get(desc.id);
            if (allocation?.buffer === undefined) continue;
            if (desc.role === 'vertex' || desc.role === 'index' || desc.role === 'indirect') {
                this.refreshGeometryBuffer(resource, allocation);
            } else {
                this.writeBufferContent(resource, allocation);
            }
        }
    }

    /**
     * Reenvia vértices/índices/argumentos; conteúdo de outra forma (tamanho, formato) recria o buffer. Geometria
     * compartilhada: mesma chave = mesmo conteúdo (nada a enviar); chave nova solta o buffer antigo e passa ao da chave
     * nova (cópia na escrita).
     */
    private refreshGeometryBuffer(resource: Resource, allocation: Allocation): void {
        const key = this.sharedGeometryKey(resource, allocation.desc);
        if (allocation.sharedKey !== undefined || key !== undefined) {
            if (key === allocation.sharedKey) return;
            if (allocation.sharedKey !== undefined) this.releaseSharedGeometry(allocation);
            else if (allocation.buffer !== undefined) this.core.destroy(allocation.buffer);
            if (key !== undefined) {
                this.acquireSharedGeometry(resource, allocation, key);
                return;
            }
            allocation.buffer = this.createGeometryBuffer(resource, allocation.desc);
            this.writeBufferContent(resource, allocation);
            return;
        }
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

function setBit(bits: Uint32Array, index: number): void {
    const word = index >>> 5;
    bits[word] = (bits[word] ?? 0) | (1 << (index & 31));
}

function clearBit(bits: Uint32Array, index: number): void {
    const word = index >>> 5;
    if (word < bits.length) bits[word] = bits[word]! & ~(1 << (index & 31));
}

function hasBit(bits: Uint32Array, index: number): boolean {
    return ((bits[index >>> 5] ?? 0) & (1 << (index & 31))) !== 0;
}

/** Bitset com espaço para `capacity` bits, preservando os bits atuais. */
function grownBits(bits: Uint32Array, capacity: number): Uint32Array {
    const grown = new Uint32Array(Math.ceil(capacity / 32));
    grown.set(bits);
    return grown;
}

/** Vista de bytes de um `ArrayBufferView`. */
function bytesOf(view: ArrayBufferView): Uint8Array {
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
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
