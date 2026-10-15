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
import { DATA_HOOK, Entity, type DataHook } from '../contracts/Entity';
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
import { asEntityId, type EntityId } from '../world/EntityId';
import { ReactiveRoot } from './reactiveData';
import { ConsumerResolverRegistry } from '../consumers/ConsumerResolverRegistry';
import { PoolResolver } from '../consumers/strategies/PoolResolver';
import { PoolLiveResolver } from '../consumers/strategies/PoolLiveResolver';
import type { Flow } from '../flows/Flow';
import { RECORD_NONE, type EntityRecordDeclaration, type ResourceType } from '../flows/slots';
import type { FlowAllocator, RegisterOptions } from '../flows/FlowRegistry';
import { FlowBinder } from './flowBinding/FlowBinder';
import { LayoutInferencer } from './LayoutInferencer';
import { FreeRanges } from './FreeRanges';

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
    /** Slot → entidade (`-1` = livre); cresce com o pool. */
    entityBySlot: Int32Array;
    /** Slot → quem o ocupa (dado empacotado no envio); array denso, `undefined` = livre. */
    readonly occupants: (Occupant | undefined)[];
    /**
     * Dado de `upload: 'initial'` empacotado na alocação, à espera do envio: o que vale é o dado do momento da inserção
     * (mutações depois dela são ignoradas, a GPU é dona).
     */
    readonly initial: Map<number, Uint8Array>;
    /** Campo `u32` das listas de instâncias (o ocupante é o valor); `undefined` nos demais pools. */
    listField: string | undefined;
    /** Valores dos registros de entidade (pools de `slot.entities({ record })`); `undefined` nos demais pools. */
    records: RecordStore | undefined;
    /** Slots livres em intervalos (alocação de faixas contíguas, spec 008). */
    readonly free: FreeRanges;
    /** Bit por slot ocupado (espelho do bitset de vivos na GPU, spec 008). */
    liveBits: Uint32Array;
    /** Bitset de vivos na GPU, criado no primeiro pedido (`poolLiveBuffer`). */
    liveSpec: StorageBufferSpec | undefined;
    /** Palavras do bitset de vivos a enviar: `[liveLo, liveHi]` (`liveLo > liveHi` = nada). */
    liveLo: number;
    liveHi: number;
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
 * Estado da C2 por Resource na cena, num único campo privado do Resource (um símbolo; um Resource está em uma cena por
 * vez): o dado cru (o empacotamento lê dele), o proxy reativo de `data`, o plano de envio calculado na alocação (os
 * slots dos descritores `'always'` em pool e se há descritores próprios — o envio por quadro não relê descritores nem
 * recalcula chaves de pool) e se está alocado. É também a raiz (e o handler) do proxy reativo: nenhuma closure nem
 * tabela por Resource (spec 007, US7 — um milhão de entidades).
 */
class Tracked extends ReactiveRoot implements DataHook {
    allocated = false;
    /**
     * Primeiro slot do Resource nos seus pools (o mesmo em todos os de mesma contagem); `-1` sem pool. Com descritores
     * de contagem `count > 1` o Resource ocupa uma faixa `[slot, slot + span)` (spec 008).
     */
    slot = -1;
    /** Slots da faixa (contagem dos descritores em pool); 1 no caso comum. */
    span = 1;
    /** Faixas por pool quando os descritores têm contagens diferentes (ex.: partículas e arestas de um corpo). */
    ranges: Map<PoolEntry, PoolRange> | undefined = undefined;
    /** Pools dos descritores `'always'` em pool (lista compartilhada pelos Resources com os mesmos pools). */
    pools: readonly PoolRef[] = NO_POOLS;
    /** Tem descritores próprios (enviados inteiros). */
    own = false;

    constructor(
        readonly owner: DataChangeSink,
        readonly resource: Resource,
        data: Record<string, unknown>,
    ) {
        super(data);
    }

    dataChanged(field: string | undefined): void {
        this.owner.dataChanged(this.resource, field);
    }
}

/** Faixa de um Resource num pool. */
interface PoolRange {
    readonly first: number;
    readonly span: number;
}

/** Primeiro slot do Resource rastreado no pool `entry`. */
function firstIn(tracked: Tracked, entry: PoolEntry): number {
    return tracked.ranges?.get(entry)?.first ?? tracked.slot;
}

/** Slots do Resource rastreado no pool `entry`. */
function spanIn(tracked: Tracked, entry: PoolEntry): number {
    return tracked.ranges?.get(entry)?.span ?? tracked.span;
}

/** Quem recebe as mutações de `data` dos Resources de uma cena (o `ResourceSystem`). */
interface DataChangeSink {
    dataChanged(resource: Resource, field: string | undefined): void;
}

/** O `Tracked` fica no gancho de `data` (campo de `Entity`; propriedade acrescentada nos demais Resources). */
type TrackedResource = Resource & { [DATA_HOOK]?: DataHook };

function trackedOf(resource: Resource): Tracked | undefined {
    return (resource as TrackedResource)[DATA_HOOK] as Tracked | undefined;
}

/** Pool de um descritor `'always'` de um Resource: o envio por quadro marca o slot do Resource nele. */
interface PoolRef {
    readonly entry: PoolEntry;
    readonly descId: string;
    /** O descritor (para `slotRefs`). */
    readonly desc: GPUDescriptor;
    /** O descritor declara `count`: o dado é por campo, empacotado por índice local da faixa (spec 008). */
    readonly counted: boolean;
}

const NO_POOLS: readonly PoolRef[] = [];

/**
 * Acessor de `data` dos Resources que não herdam de `Entity` (ou que declaram o próprio campo `data`), posto na
 * instância — as mesmas duas funções para todos (o estado fica no `Tracked`). Funciona igual ao acessor de `Entity`,
 * mas a redefinição põe o objeto em modo dicionário no V8 (mais memória por Resource).
 */
const REACTIVE_DATA: PropertyDescriptor = {
    configurable: true,
    enumerable: true,
    get(this: TrackedResource): Record<string, unknown> {
        return this[DATA_HOOK]!.proxied;
    },
    set(this: TrackedResource, next: Record<string, unknown>): void {
        const hook = this[DATA_HOOK]!;
        hook.replace(next);
        hook.dataChanged(undefined);
    },
};

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
    /** Slots lidos a partir de `slot` (faixa do Resource; 1 no caso comum). */
    readonly span: number;
    /** O descritor declara `count`: a resposta é por campo (`unpackRange`), mesmo com um slot. */
    readonly counted: boolean;
    readonly schema: StructSchema;
    readonly request: PendingRead;
}

/**
 * Registros de entidade de um pool (`slot.entities({ record })`): os campos `u32` de cada slot num array tipado (sem
 * objeto por entidade), e o objeto reutilizado no empacotamento.
 */
interface RecordStore {
    readonly fields: readonly string[];
    data: Uint32Array;
    readonly scratch: Record<string, number>;
}

/** Marca de slot ocupado por um registro de entidade (os valores estão no `RecordStore` do pool). */
const RECORD_OCCUPANT = Symbol('clayflow.record');

/**
 * Ocupante de um slot de pool: o Resource (dado em `resource.data`), um registro de entidade da C2 ou, nas listas de
 * instâncias, o próprio valor.
 */
type Occupant = Resource | typeof RECORD_OCCUPANT | number;

/** O que a C2 alocou para um descritor individual (não-pool) de um recurso. */
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
    /** Ouvinte das mutações de `data` dos Resources desta cena (um para todos). */
    private readonly dataSink: DataChangeSink = {
        dataChanged: (resource, field) => {
            this.markDirty(resource, field);
        },
    };
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
    /** Escritor na GPU de cada descritor individual (`owns`, spec 008). */
    private readonly writers = new WeakMap<Resource, Map<string, object>>();
    /** Quem guarda slots de cada Resource (`slotRefs` com `ref:`), para avisar quando o alvo sai antes. */
    private readonly referrers = new WeakMap<Resource, Set<Resource>>();
    /** Buffers de vértice/índice compartilhados por chave de conteúdo: o spec e quantas alocações o usam. */
    private readonly sharedGeometry = new Map<
        string,
        { readonly key: string; spec: AnyBufferSpec; users: number }
    >();
    /**
     * Alocações próprias idênticas (todas de geometria compartilhada por conteúdo) usadas por vários Resources: um mapa
     * por combinação de chaves, compartilhado (cópia na escrita quando o conteúdo de um Resource muda).
     */
    private readonly sharedOwn = new Map<string, Map<string, Allocation>>();
    private readonly sharedOwnMaps = new WeakSet<Map<string, Allocation>>();
    /** Listas de pools por combinação (Resources com os mesmos pools compartilham a lista). */
    private readonly poolRefLists = new Map<string, readonly PoolRef[]>();
    /** Objeto reutilizado para empacotar o valor de uma lista de instâncias. */
    private readonly listValue: Record<string, number> = {};
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
            // Composição trocada (`World.attach`/`detach`): o registro é refeito com os recursos de agora.
            this.events.on('entitiesRecomposed', (e) => {
                for (const set of this.recordSets.values())
                    for (const id of e.entityIds) {
                        this.removeRecord(set, id);
                        this.addRecord(set, id);
                    }
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
        for (const [field, [type, , opts]] of Object.entries(declaration.fields)) {
            if (!declaration.schema.fields.has(field)) {
                throw new Error(
                    `ResourceSystem: registro '${key}': campo '${field}' fora do schema.`,
                );
            }
            if (opts?.optional !== true && !all.includes(type)) {
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
        const fields = Object.keys(declaration.fields);
        entry.records ??= {
            fields,
            data: new Uint32Array(entry.capacity * fields.length),
            scratch: {},
        };
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
            this.pools.get(key)!.listField = fields[0]![0];
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
        entry.occupants.forEach((occupant, slot) => {
            if (occupant !== undefined) this.clearInstance(schema.name, slot);
        });
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
        occupy(entry, index, value);
        this.markSlot(entry, index);
    }

    /** Libera a posição `index` da lista de instâncias. */
    clearInstance(poolKey: string, index: number): void {
        const entry = this.pools.get(poolKey);
        if (entry === undefined) return;
        entry.occupants[index] = undefined;
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
        if (this.isIndividual(resource, descId)) {
            this.acquireWriter(owner, resource, descId);
            return;
        }
        const located = this.poolSlotOfDescriptor(resource, descId);
        if (located === undefined) return;
        const { entry, slot, span } = located;
        const current = entry.owners.get(slot);
        if (current !== undefined && current !== owner) {
            throw new Error(
                `ResourceSystem: o descritor '${descId}' de '${this.schemaNameOf(resource)}' já tem dono na GPU `
                    + '(dois conjuntos declaram owns sobre o mesmo dado).',
            );
        }
        for (let k = slot; k < slot + span; k++) {
            entry.owners.set(k, owner);
            setBit(entry.ownedBits, k);
        }
    }

    /** Devolve à CPU a posse tomada por `owner`; o dado de intenção é reenviado no próximo envio. */
    releaseOwnership(owner: object, resource: Resource, descId: string): void {
        const writers = this.writers.get(resource);
        if (writers?.get(descId) === owner) {
            writers.delete(descId);
            return;
        }
        const located = this.poolSlotOfDescriptor(resource, descId);
        if (located === undefined) return;
        const { entry, slot, span } = located;
        if (entry.owners.get(slot) !== owner) return;
        for (let k = slot; k < slot + span; k++) {
            entry.owners.delete(k);
            clearBit(entry.ownedBits, k);
            this.markSlot(entry, k);
        }
    }

    hasGpuWriter(resource: Resource, descId: string): boolean {
        return this.writers.get(resource)?.has(descId) === true;
    }

    /** O descritor `descId` de `resource` é individual (não em pool)? */
    private isIndividual(resource: Resource, descId: string): boolean {
        const desc = resource.getDescriptors().find((d) => d.id === descId);
        return desc !== undefined && desc.storage !== 'pool';
    }

    /**
     * Registra o escritor na GPU de um descritor individual (`owns` sobre geometria escrita por um estágio, spec 008).
     * @throws Error se outro conjunto já escreve o descritor.
     */
    private acquireWriter(owner: object, resource: Resource, descId: string): void {
        let writers = this.writers.get(resource);
        if (writers === undefined) this.writers.set(resource, (writers = new Map()));
        const current = writers.get(descId);
        if (current !== undefined && current !== owner) {
            throw new Error(
                `ResourceSystem: o descritor '${descId}' de '${this.schemaNameOf(resource)}' já tem escritor na GPU `
                    + '(dois conjuntos declaram owns sobre o mesmo dado).',
            );
        }
        writers.set(descId, owner);
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
    ): { entry: PoolEntry; slot: number; span: number } | undefined {
        const poolKey = this.poolKeyOf(resource, descId);
        const entry = poolKey === undefined ? undefined : this.pools.get(poolKey);
        const tracked = trackedOf(resource);
        if (entry === undefined || tracked === undefined) return undefined;
        const slot = firstIn(tracked, entry);
        return entry.occupants[slot] !== resource
            ? undefined
            : { entry, slot, span: spanIn(tracked, entry) };
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
            const wanted = new Set<number>();
            for (const item of items) for (let k = 0; k < item.span; k++) wanted.add(item.slot + k);
            const slots = [...wanted].sort((a, b) => a - b);
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
                    const alive = trackedOf(item.request.resource)?.allocated === true;
                    if (!alive) item.request.resolve(undefined);
                    else if (item.span > 1 || item.counted)
                        item.request.resolve(item.schema.unpackRange(bytes, item.span, dstOffset));
                    else item.request.resolve(item.schema.unpack(bytes, dstOffset));
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
        if (trackedOf(resource)?.allocated !== true) return undefined;
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
            const tracked = trackedOf(resource)!;
            if (entry === undefined) return undefined;
            const slot = firstIn(tracked, entry);
            if (entry.occupants[slot] !== resource) return undefined;
            return {
                source: entry.bufferSpec,
                stride: entry.stride,
                slot,
                span: spanIn(tracked, entry),
                counted: desc.count !== undefined,
                schema,
            };
        }
        const buffer = this.allocations.get(resource)?.get(desc.id)?.buffer;
        if (buffer === undefined) return undefined;
        return {
            source: buffer,
            stride: alignUp(schema.stride, 4),
            slot: 0,
            span: 1,
            counted: false,
            schema,
        };
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

    /**
     * Aloca agora o descritor individual `descId` de `resource` se ainda não estiver alocado (descritores
     * `allocation: 'onDemand'`; spec 008) e devolve o buffer — ou `undefined` para textura (spec 017; lida por
     * `textureOf`/`textureViewOf`; as `sizeFromCanvas` acompanham o canvas como as demais). Chamado fora da gravação
     * (numa transição). Resource fora da cena ou sem o descritor: `undefined`.
     */
    ensureAllocated(resource: Resource, descId: string): AnyBufferSpec | undefined {
        if (trackedOf(resource)?.allocated !== true) return undefined;
        const existing = this.allocations.get(resource)?.get(descId);
        if (existing !== undefined) return existing.buffer;
        const desc = resource.getDescriptors().find((d) => d.id === descId && d.storage !== 'pool');
        if (desc === undefined) return undefined;
        const allocation = this.allocateDescriptor(resource, desc);
        const own = this.ownForWrite(resource);
        if (own === undefined) this.allocations.set(resource, new Map([[desc.id, allocation]]));
        else own.set(desc.id, allocation);
        return allocation.buffer;
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

    /** Faixa de um entityId no pool (`count` slots a partir de `first`; spec 008). */
    poolRangeOf(
        poolKey: string,
        entityId: EntityId,
    ):
        | {
              /** Primeiro slot da faixa. */
              readonly first: number;
              /** Slots da faixa. */
              readonly count: number;
          }
        | undefined {
        const entry = this.pools.get(poolKey);
        const first = entry?.slotByEntity.get(entityId);
        if (entry === undefined || first === undefined) return undefined;
        const occupant = entry.occupants[first];
        const tracked =
            occupant === undefined || typeof occupant === 'number' || occupant === RECORD_OCCUPANT
                ? undefined
                : trackedOf(occupant);
        return { first, count: tracked === undefined ? 1 : spanIn(tracked, entry) };
    }

    /** O slot do pool é de posse da GPU (`acquireOwnership`)? */
    poolSlotOwnedByGpu(poolKey: string, slot: number): boolean {
        const entry = this.pools.get(poolKey);
        return entry !== undefined && hasBit(entry.ownedBits, slot);
    }

    /** EntityId que ocupa o slot dado dentro do pool. Inverso de `poolSlotOf`. */
    poolEntityBySlot(poolKey: string, slot: number): EntityId | undefined {
        const id = this.pools.get(poolKey)?.entityBySlot[slot];
        return id === undefined || id < 0 ? undefined : asEntityId(id);
    }

    /**
     * Bitset de slots ocupados do pool na GPU (`array<u32>`, um bit por slot; spec 008): criado no primeiro pedido com
     * o estado atual e mantido por envio das palavras mudadas no mesmo quadro da alocação ou liberação; recriado no
     * crescimento do pool (com `poolReallocated`).
     */
    poolLiveBuffer(poolKey: string): StorageBufferSpec | undefined {
        const entry = this.pools.get(poolKey);
        if (entry === undefined) return undefined;
        entry.liveSpec ??= this.createLiveBuffer(entry);
        return entry.liveSpec;
    }

    /** Cria o bitset de vivos com o tamanho da capacidade e escreve o estado atual. */
    private createLiveBuffer(entry: PoolEntry): StorageBufferSpec {
        const spec = this.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: `pool:${entry.poolKey}:live:gen${entry.generation}`,
            byteSize: Math.max(4, entry.liveBits.byteLength),
        });
        this.core.write(spec, entry.liveBits);
        entry.liveLo = 1;
        entry.liveHi = 0;
        return spec;
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
        // Quem referencia slots de outro Resource (`slotRefs` com `ref:`) é alocado depois dos referidos da mesma
        // inserção (spec 008).
        const referring: Resource[] = [];
        for (const r of added) this.allocate(r, referring);
        for (const r of referring) this.allocate(r);
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
        // O estado da C2 fica no próprio Resource (sem consulta a mapa por mutação).
        const tracked = trackedOf(resource);
        if (tracked?.allocated !== true) return;
        const state = resource.state;
        if (state !== ResourceState.Ready && state !== ResourceState.Dirty) {
            const handler = this.stateRegistry.get(state);
            if (handler.ignoreDirtyMark()) {
                if (handler.reportsIgnoredMutation()) this.warnIgnoredMutation(resource);
                return;
            }
        }
        // Só objetos próprios passam pela fila (e pelo estado Dirty); dado em pool vai pelo slot marcado abaixo.
        if (tracked.own && state !== ResourceState.Dirty) {
            this.transition(resource, ResourceState.Dirty);
            this.dirty.add(resource);
        }
        for (const { entry, descId } of tracked.pools) {
            const first = firstIn(tracked, entry);
            if (hasBit(entry.ownedBits, first) && hasBit(entry.writtenBits, first)) {
                this.warnOwnedMutation(resource, descId);
                continue;
            }
            const end = first + spanIn(tracked, entry);
            for (let slot = first; slot < end; slot++) this.markSlot(entry, slot, field);
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
                if (trackedOf(resource)?.allocated !== true) continue;
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
    private occupantData(
        entry: PoolEntry,
        slot: number,
        occupant: Occupant,
    ): Record<string, unknown> {
        if (typeof occupant === 'number') {
            this.listValue[entry.listField!] = occupant;
            return this.listValue;
        }
        if (occupant === RECORD_OCCUPANT) {
            const store = entry.records!;
            const base = slot * store.fields.length;
            store.fields.forEach((field, i) => {
                store.scratch[field] = store.data[base + i]!;
            });
            return store.scratch;
        }
        return trackedOf(occupant)?.raw ?? (occupant.data as Record<string, unknown>);
    }

    /** Marca as palavras do bitset de vivos de `[first, end)` para o próximo envio (só se o bitset existe na GPU). */
    private markLive(entry: PoolEntry, first: number, end: number): void {
        if (entry.liveSpec === undefined || end <= first) return;
        entry.liveLo = Math.min(entry.liveLo > entry.liveHi ? Infinity : entry.liveLo, first >>> 5);
        entry.liveHi = Math.max(entry.liveHi, (end - 1) >>> 5);
        if (!entry.queued) {
            entry.queued = true;
            this.dirtyPools.add(entry);
        }
    }

    /** Envia as palavras marcadas do bitset de vivos numa escrita. */
    private flushLive(entry: PoolEntry): void {
        if (entry.liveSpec === undefined || entry.liveLo > entry.liveHi) return;
        const lo = entry.liveLo;
        const hi = entry.liveHi;
        entry.liveLo = 1;
        entry.liveHi = 0;
        this.core.write(entry.liveSpec, entry.liveBits.subarray(lo, hi + 1), lo * 4);
    }

    /**
     * Pool `'always'` do ocupante cujo empacotamento não é o do dado inteiro (spec 008): dado por campo (`count`) ou com
     * referências de slot; `undefined` nos demais.
     */
    private packedRef(entry: PoolEntry, occupant: Occupant): PoolRef | undefined {
        if (typeof occupant === 'number' || occupant === RECORD_OCCUPANT) return undefined;
        const pools = trackedOf(occupant)?.pools;
        if (pools === undefined || pools === NO_POOLS) return undefined;
        for (const ref of pools)
            if (ref.entry === entry && (ref.counted || ref.desc.slotRefs !== undefined)) return ref;
        return undefined;
    }

    /** Faixa do descritor `descId` (em pool) de `resource` na cena, ou `undefined`. */
    private rangeOfDescriptor(resource: Resource, descId: string): PoolRange | undefined {
        const tracked = trackedOf(resource);
        if (tracked === undefined) return undefined;
        const desc = resource
            .getDescriptors()
            .find((d) => d.id === descId && d.storage === 'pool' && d.schema !== undefined);
        if (desc?.schema === undefined) return undefined;
        const entry = this.pools.get(this.computePoolKey(desc.schema, resource));
        if (entry === undefined) return undefined;
        const first = firstIn(tracked, entry);
        if (first < 0 || entry.occupants[first] !== resource) return undefined;
        return { first, span: spanIn(tracked, entry) };
    }

    /** Slot absoluto de uma referência (`slotRefs`), com o erro que nomeia o descritor, o campo e o alvo. */
    private refSlot(
        resource: Resource,
        desc: GPUDescriptor,
        field: string,
        target: Resource,
        targetDesc: string,
        index: unknown,
    ): number {
        const where = `ResourceSystem: '${this.schemaNameOf(resource)}', descritor '${desc.id}', campo '${field}'`;
        const range = this.rangeOfDescriptor(target, targetDesc);
        if (range === undefined) {
            throw new Error(
                `${where}: o Resource referido ('${this.schemaNameOf(target)}') não está na cena com o descritor `
                    + `'${targetDesc}' — insira-o antes de quem o referencia.`,
            );
        }
        if (
            typeof index !== 'number'
            || !Number.isInteger(index)
            || index < 0
            || index >= range.span
        ) {
            throw new RangeError(
                `${where}: índice ${String(index)} fora da faixa de '${this.schemaNameOf(target)}' `
                    + `(${range.span} slots no descritor '${targetDesc}').`,
            );
        }
        if (target !== resource) this.noteReferrer(target, resource);
        return range.first + index;
    }

    /** Cópia rasa do registro com os campos de `slotRefs` trocados pelo slot absoluto (dado de um registro). */
    private resolveSlotRefs(
        resource: Resource,
        desc: GPUDescriptor,
        value: Record<string, unknown>,
    ): Record<string, unknown> {
        const refs = desc.slotRefs;
        if (refs === undefined) return value;
        const out = { ...value };
        for (const [field, target] of Object.entries(refs)) {
            const v = value[field];
            if (v === undefined) continue;
            const [kind, descId] = splitTarget(target);
            if (kind === 'self') {
                out[field] = this.refSlot(resource, desc, field, resource, descId, v);
                continue;
            }
            const ref = v as { body?: unknown; index?: unknown };
            out[field] = this.refSlot(
                resource,
                desc,
                field,
                ref.body as Resource,
                descId,
                ref.index,
            );
        }
        return out;
    }

    /**
     * Reescreve, nos bytes já empacotados de `n` registros a partir de `byteOffset`, os campos de `slotRefs` com o slot
     * absoluto — dado por campo (`count`), só alvos `self:` (índices locais em arrays).
     */
    private patchSlotRefs(
        target: ArrayBuffer | Uint8Array,
        byteOffset: number,
        schema: StructSchema,
        resource: Resource,
        desc: GPUDescriptor,
        start: number,
        n: number,
    ): void {
        const refs = desc.slotRefs;
        if (refs === undefined) return;
        const soa = (trackedOf(resource)?.raw ?? (resource.data as Record<string, unknown>))[
            desc.id
        ] as Record<string, unknown>;
        const buffer = target instanceof ArrayBuffer ? target : (target.buffer as ArrayBuffer);
        const base = (target instanceof ArrayBuffer ? 0 : target.byteOffset) + byteOffset;
        const view = new DataView(buffer);
        for (const [field, ref] of Object.entries(refs)) {
            const [kind, descId] = splitTarget(ref);
            if (kind !== 'self') {
                throw new TypeError(
                    `ResourceSystem: '${this.schemaNameOf(resource)}', descritor '${desc.id}': referência '${ref}' `
                        + "no campo '"
                        + field
                        + "' de um dado por campo (count) — só 'self:' é aceito.",
                );
            }
            const values = soa[field] as ArrayLike<number> | undefined;
            if (values === undefined) continue;
            const offset = schema.offsetOf(field);
            for (let k = 0; k < n; k++) {
                const slot = this.refSlot(
                    resource,
                    desc,
                    field,
                    resource,
                    descId,
                    values[start + k],
                );
                view.setUint32(base + k * schema.stride + offset, slot, true);
            }
        }
    }

    /** Registra que `referrer` guarda slots de `target` (aviso se `target` sair antes). */
    private noteReferrer(target: Resource, referrer: Resource): void {
        let set = this.referrers.get(target);
        if (set === undefined) this.referrers.set(target, (set = new Set()));
        set.add(referrer);
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
            this.flushLive(entry);
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
                    if (entry.occupants[slot] === undefined) continue;
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
            const occupant = entry.occupants[slot]!;
            const offset = (slot - first) * entry.stride;
            const schema = entry.schema;
            const initial = entry.initial.size > 0 ? entry.initial.get(slot) : undefined;
            if (initial !== undefined) {
                new Uint8Array(this.scratch, offset, entry.stride).set(initial);
                entry.initial.delete(slot);
            } else if (schema instanceof StructSchema && this.packedRef(entry, occupant)) {
                const resource = occupant as Resource;
                const tracked = trackedOf(resource)!;
                const ref = this.packedRef(entry, occupant)!;
                const raw = tracked.raw;
                if (ref.counted) {
                    const local = slot - firstIn(tracked, entry);
                    const soa = raw[ref.descId] as Record<string, unknown>;
                    schema.packRangeInto(this.scratch, offset, soa, local, 1);
                    this.patchSlotRefs(this.scratch, offset, schema, resource, ref.desc, local, 1);
                } else {
                    schema.packInto(
                        this.scratch,
                        offset,
                        this.resolveSlotRefs(resource, ref.desc, raw),
                    );
                }
            } else if (schema instanceof StructSchema) {
                schema.packInto(this.scratch, offset, this.occupantData(entry, slot, occupant));
            } else {
                const packed = schema.pack(this.occupantData(entry, slot, occupant));
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
        const previous = trackedOf(resource);
        if (previous?.owner === this.dataSink) return;
        // Vindo de outra cena: o dado cru continua o mesmo; o proxy passa a notificar esta.
        const data = previous?.raw ?? (resource.data as Record<string, unknown>);
        (resource as TrackedResource)[DATA_HOOK] = new Tracked(this.dataSink, resource, data);
        // `Entity` já tem o acessor no protótipo; os demais recebem um na instância.
        if (!(resource instanceof Entity) || Object.prototype.hasOwnProperty.call(resource, 'data'))
            Object.defineProperty(resource, 'data', REACTIVE_DATA);
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

    /**
     * Aloca o Resource. Com `deferred`, quem referencia slots de outros (`slotRefs` com `ref:`) vai para a lista e é
     * alocado depois dos demais da mesma inserção.
     */
    private allocate(resource: Resource, deferred?: Resource[]): void {
        const descs = resource.getDescriptors();
        if (deferred !== undefined && descs.some(refersOthers)) {
            deferred.push(resource);
            return;
        }
        // Reinserção após remoção: a instância volta ao início do ciclo.
        if (resource.state === ResourceState.Destroyed) {
            this.transition(resource, ResourceState.Uninitialized);
        }
        this.transition(resource, ResourceState.Loading);
        this.installReactiveData(resource);

        const pooled = descs.filter((d) => d.storage === 'pool' && d.schema !== undefined);
        if (pooled.length > 0) this.allocatePooled(resource, pooled);
        const own = new Map<string, Allocation>();
        for (const desc of descs) {
            if (desc.storage === 'pool' || desc.allocation === 'onDemand') continue;
            own.set(desc.id, this.allocateDescriptor(resource, desc));
        }
        if (own.size > 0) this.allocations.set(resource, this.shareOwn(own));
        const tracked = trackedOf(resource)!;
        tracked.own = own.size > 0;
        tracked.allocated = true;
        this.transition(resource, ResourceState.Ready);
        if (this.isGpuOwned(descs)) this.transition(resource, ResourceState.GpuManaged);
        // Dado em pool é anunciado no envio (`poolWritten`); `resourceReady` é dos objetos próprios.
        if (own.size > 0) this.events.emit('resourceReady', { payload: { resource } });
    }

    /**
     * Alocações só de geometria compartilhada: devolve o mapa já usado por outro Resource com as mesmas chaves (a
     * contagem de usuários de cada chave já inclui este Resource) — nenhum objeto de alocação por entidade.
     */
    private shareOwn(own: Map<string, Allocation>): Map<string, Allocation> {
        let signature = '';
        for (const [id, allocation] of own) {
            if (allocation.sharedKey === undefined) return own;
            signature += `${id}=${allocation.sharedKey}|`;
        }
        const existing = this.sharedOwn.get(signature);
        if (existing !== undefined) return existing;
        this.sharedOwn.set(signature, own);
        this.sharedOwnMaps.add(own);
        return own;
    }

    /** Alocações próprias do Resource para mudar: um mapa compartilhado vira cópia própria antes. */
    private ownForWrite(resource: Resource): Map<string, Allocation> | undefined {
        const own = this.allocations.get(resource);
        if (own === undefined || !this.sharedOwnMaps.has(own)) return own;
        const copy = new Map([...own].map(([id, allocation]) => [id, { ...allocation }]));
        this.allocations.set(resource, copy);
        return copy;
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
            if (
                content === undefined
                && policyOf(desc) === 'never'
                && desc.indexFormat === undefined
            ) {
                throw new Error(
                    `ResourceSystem: descritor de índice '${desc.id}' de '${this.schemaNameOf(resource)}' com upload `
                        + "'never' precisa de indexFormat ('uint16' ou 'uint32').",
                );
            }
            const format: GPUIndexFormat =
                desc.indexFormat ?? (content instanceof Uint32Array ? 'uint32' : 'uint16');
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
            shared = { key, spec, users: 0 };
            this.sharedGeometry.set(key, shared);
            allocation.buffer = spec;
            this.writeBufferContent(resource, allocation);
        }
        shared.users++;
        allocation.buffer = shared.spec;
        // A chave da entrada (uma string por conteúdo, não uma por Resource).
        allocation.sharedKey = shared.key;
    }

    /**
     * Solta um uso do buffer compartilhado da chave; o último usuário o destrói (e os mapas de alocação compartilhados
     * que o citam saem do cache).
     */
    private releaseSharedGeometry(key: string): void {
        const shared = this.sharedGeometry.get(key);
        if (shared === undefined) return;
        if (--shared.users > 0) return;
        this.sharedGeometry.delete(key);
        this.core.destroy(shared.spec);
        for (const [signature, own] of this.sharedOwn) {
            if (![...own.values()].some((a) => a.sharedKey === key)) continue;
            this.sharedOwn.delete(signature);
        }
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
            usage: textureUsage(desc.role, format, shape.sampleCount ?? 1),
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

    /**
     * Aloca a faixa do recurso nos seus pools: um slot (ou `count` slots contíguos, spec 008) comum aos pools de mesma
     * contagem; contagens diferentes ganham faixas próprias.
     */
    private allocatePooled(resource: Resource, descs: readonly GPUDescriptor[]): void {
        const byCount = new Map<
            number,
            { desc: GPUDescriptor; schema: Schema; entry: PoolEntry }[]
        >();
        const all: { desc: GPUDescriptor; entry: PoolEntry }[] = [];
        for (const desc of descs) {
            const schema = desc.schema;
            if (schema === undefined) continue;
            const span = desc.count ?? 1;
            if (!Number.isInteger(span) || span < 1) {
                throw new RangeError(
                    `ResourceSystem: descritor '${desc.id}' de '${this.schemaNameOf(resource)}' com count ${span} `
                        + '(em pool, count é um inteiro ≥ 1).',
                );
            }
            const poolKey = this.computePoolKey(schema, resource);
            const entry = this.pools.get(poolKey) ?? this.createPool(poolKey, desc, schema);
            let group = byCount.get(span);
            if (group === undefined) byCount.set(span, (group = []));
            group.push({ desc, schema, entry });
            all.push({ desc, entry });
        }
        const tracked = trackedOf(resource)!;
        tracked.pools = this.poolRefsOf(all);
        tracked.ranges = undefined;
        const entityId = this.world.entityIdOfResource(resource);
        let primary = true;
        for (const [span, group] of byCount) {
            const first = this.chooseRange(
                group.map((g) => g.entry),
                span,
            );
            if (primary) {
                tracked.slot = first;
                tracked.span = span;
                primary = false;
            } else {
                tracked.ranges ??= new Map();
            }
            for (const { entry } of group) {
                if (tracked.ranges !== undefined) tracked.ranges.set(entry, { first, span });
                this.occupyRange(entry, first, span, resource, entityId);
            }
        }
        // Com contagens diferentes, o primário também entra no mapa (cada pool consulta a sua faixa).
        if (tracked.ranges !== undefined) {
            for (const { entry } of byCount.values().next().value ?? []) {
                tracked.ranges.set(entry, { first: tracked.slot, span: tracked.span });
            }
        }
        // Empacotado depois de todas as faixas ocupadas: referências `self:` a outro descritor já resolvem.
        for (const group of byCount.values()) {
            for (const { desc, schema, entry } of group) {
                const first = firstIn(tracked, entry);
                const span = spanIn(tracked, entry);
                const policy = policyOf(desc);
                if (policy === 'initial')
                    this.packInitial(entry, schema, resource, desc, first, span);
                // Referências validadas na inserção (o erro nomeia o alvo antes do primeiro envio).
                else if (desc.slotRefs !== undefined && desc.count === undefined)
                    this.resolveSlotRefs(resource, desc, resource.data as Record<string, unknown>);
                // O dado inicial vai no próximo envio, junto com os vizinhos (faixas contíguas).
                if (policy !== 'never')
                    for (let k = 0; k < span; k++) this.markSlot(entry, first + k);
            }
        }
    }

    /** Ocupa `[first, first + span)` de `entry` com o ocupante, crescendo o pool se preciso. */
    private occupyRange(
        entry: PoolEntry,
        first: number,
        span: number,
        occupant: Occupant,
        entityId: EntityId | undefined,
    ): void {
        const end = first + span;
        while (end > entry.capacity) this.growPool(entry);
        // Slots pulados (ocupados em outro pool do grupo) ficam livres neste pool.
        if (first > entry.count) entry.free.release(entry.count, first - entry.count);
        entry.free.take(first, span);
        entry.count = Math.max(entry.count, end);
        for (let slot = first; slot < end; slot++) {
            occupy(entry, slot, occupant);
            setBit(entry.liveBits, slot);
            if (entityId !== undefined) entry.entityBySlot[slot] = entityId;
        }
        this.markLive(entry, first, end);
        if (entityId !== undefined) entry.slotByEntity.set(entityId, first);
    }

    /** Empacota o dado de `upload: 'initial'` da faixa (o do momento da inserção), por slot. */
    private packInitial(
        entry: PoolEntry,
        schema: Schema,
        resource: Resource,
        desc: GPUDescriptor,
        first: number,
        span: number,
    ): void {
        const data = resource.data as Record<string, unknown>;
        if (span === 1 && desc.count === undefined) {
            entry.initial.set(
                first,
                bytesOf(schema.pack(this.resolveSlotRefs(resource, desc, data))),
            );
            return;
        }
        const bytes = this.packRangeOf(schema, resource, desc, 0, span);
        this.patchSlotRefs(bytes, 0, schema as StructSchema, resource, desc, 0, span);
        for (let k = 0; k < span; k++) {
            entry.initial.set(first + k, bytes.subarray(k * entry.stride, (k + 1) * entry.stride));
        }
    }

    /** Bytes dos registros `start..start+n` do dado por campo `data[desc.id]` de um descritor com `count`. */
    private packRangeOf(
        schema: Schema,
        resource: Resource,
        desc: GPUDescriptor,
        start: number,
        n: number,
    ): Uint8Array {
        const soa = (resource.data as Record<string, unknown>)[desc.id];
        if (!(schema instanceof StructSchema) || typeof soa !== 'object' || soa === null) {
            throw new TypeError(
                `ResourceSystem: descritor '${desc.id}' de '${this.schemaNameOf(resource)}' com count `
                    + `${desc.count ?? 1} precisa de StructSchema e de data.${desc.id} por campo (um array por campo).`,
            );
        }
        return schema.packRange(soa as Record<string, unknown>, start, n);
    }

    /** Lista de pools `'always'` dos descritores, compartilhada pelos Resources com a mesma combinação. */
    private poolRefsOf(
        entries: readonly { desc: GPUDescriptor; entry: PoolEntry }[],
    ): readonly PoolRef[] {
        const always = entries.filter(({ desc }) => policyOf(desc) === 'always');
        if (always.length === 0) return NO_POOLS;
        const key = always
            .map(
                ({ desc, entry }) =>
                    `${entry.poolKey}/${desc.id}${desc.count === undefined ? '' : '#'}`
                    + (desc.slotRefs === undefined
                        ? ''
                        : `@${Object.entries(desc.slotRefs).join(',')}`),
            )
            .join('|');
        let refs = this.poolRefLists.get(key);
        if (refs === undefined) {
            refs = always.map(({ desc, entry }) => ({
                entry,
                descId: desc.id,
                desc,
                counted: desc.count !== undefined,
            }));
            this.poolRefLists.set(key, refs);
        }
        return refs;
    }

    /** Menor início de `span` slots livres em todos os pools do grupo (intervalos livres do primeiro, depois o fim). */
    private chooseRange(entries: readonly PoolEntry[], span: number): number {
        const [first, ...rest] = entries;
        const freeEverywhere = (start: number): boolean =>
            rest.every((e) => {
                for (let k = 0; k < span; k++)
                    if (e.occupants[start + k] !== undefined) return false;
                return true;
            });
        for (const candidate of first?.free.candidates(span) ?? []) {
            if (freeEverywhere(candidate)) return candidate;
        }
        let start = Math.max(...entries.map((e) => e.count));
        while (
            !entries.every((e) => {
                for (let k = 0; k < span; k++)
                    if (e.occupants[start + k] !== undefined) return false;
                return true;
            })
        )
            start++;
        return start;
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
            entityBySlot: new Int32Array(capacity).fill(-1),
            occupants: [],
            initial: new Map(),
            listField: undefined,
            records: undefined,
            free: new FreeRanges(),
            liveBits: new Uint32Array(Math.ceil(capacity / 32)),
            liveSpec: undefined,
            liveLo: 1,
            liveHi: 0,
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
        this.consumers.registerDefault(new PoolLiveResolver(poolKey));
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
        entry.liveBits = grownBits(entry.liveBits, entry.capacity);
        if (entry.liveSpec !== undefined) {
            this.core.destroy(entry.liveSpec);
            entry.liveSpec = this.createLiveBuffer(entry);
        }
        const entities = new Int32Array(entry.capacity).fill(-1);
        entities.set(entry.entityBySlot);
        entry.entityBySlot = entities;
        if (entry.records !== undefined) {
            const data = new Uint32Array(entry.capacity * entry.records.fields.length);
            data.set(entry.records.data);
            entry.records.data = data;
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
        const slot = this.chooseRange([entry], 1);
        this.occupyRange(entry, slot, 1, RECORD_OCCUPANT, id);
        const store = entry.records!;
        store.fields.forEach((field, i) => {
            store.data[slot * store.fields.length + i] = values[field]!;
        });
        this.markSlot(entry, slot);
    }

    private removeRecord(set: RecordSet, id: EntityId): void {
        const entry = set.entry;
        const slot = entry.slotByEntity.get(id);
        if (slot === undefined) return;
        entry.slotByEntity.delete(id);
        entry.entityBySlot[slot] = -1;
        entry.occupants[slot] = undefined;
        entry.free.release(slot, 1);
        clearBit(entry.liveBits, slot);
        this.markLive(entry, slot, slot + 1);
        this.clearSlot(entry, slot);
        clearBit(entry.writtenBits, slot);
    }

    /** Campos do registro: o slot de pool do descritor nomeado do Resource de cada tipo; `undefined` se faltar algum. */
    private recordValues(set: RecordSet, id: EntityId): Record<string, number> | undefined {
        const resources = this.world.resourcesOf(id);
        if (!set.all.every((type) => resources.some((r) => r instanceof type))) return undefined;
        const values: Record<string, number> = {};
        for (const [field, [type, descId, opts]] of Object.entries(set.declaration.fields)) {
            const resource = resources.find((r) => r instanceof type);
            if (resource === undefined && opts?.optional === true) {
                values[field] = RECORD_NONE;
                continue;
            }
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
        const referrers = this.referrers.get(resource);
        if (referrers !== undefined) {
            this.referrers.delete(resource);
            const alive = [...referrers].filter((r) => trackedOf(r)?.allocated === true);
            if (alive.length > 0) {
                console.warn(
                    `[ResourceSystem] '${this.schemaNameOf(resource)}' saiu da cena com ${alive.length} Resource(s) `
                        + `que guardam slots dele ('${this.schemaNameOf(alive[0]!)}', slotRefs): os slots ficam livres `
                        + '(bit de vivo zerado); remova as referências junto com o alvo.',
                );
            }
        }
        const tracked = trackedOf(resource);
        if (tracked !== undefined) tracked.allocated = false;
        this.dirty.delete(resource);
        const own = this.allocations.get(resource);
        if (own !== undefined) {
            for (const allocation of own.values()) {
                if (allocation.sharedKey !== undefined) {
                    this.releaseSharedGeometry(allocation.sharedKey);
                    continue;
                }
                if (allocation.buffer !== undefined) this.core.destroy(allocation.buffer);
                this.releaseTexture(allocation);
                if (allocation.sampler !== undefined) this.core.destroy(allocation.sampler);
            }
            this.allocations.delete(resource);
        }
        for (const desc of resource.getDescriptors()) {
            if (desc.storage !== 'pool' || desc.schema === undefined) continue;
            const entry = this.pools.get(this.computePoolKey(desc.schema, resource));
            if (entry === undefined || tracked === undefined) continue;
            const first = firstIn(tracked, entry);
            if (entry.occupants[first] !== resource) continue;
            const span = spanIn(tracked, entry);
            const eid = entry.entityBySlot[first]!;
            if (eid >= 0) entry.slotByEntity.delete(asEntityId(eid));
            for (let slot = first; slot < first + span; slot++) {
                entry.occupants[slot] = undefined;
                entry.initial.delete(slot);
                entry.entityBySlot[slot] = -1;
                this.clearSlot(entry, slot);
                clearBit(entry.writtenBits, slot);
                clearBit(entry.ownedBits, slot);
                entry.owners.delete(slot);
                clearBit(entry.liveBits, slot);
            }
            entry.free.release(first, span);
            this.markLive(entry, first, first + span);
        }
        if (tracked !== undefined) {
            tracked.slot = -1;
            tracked.span = 1;
            tracked.ranges = undefined;
            tracked.pools = NO_POOLS;
            tracked.own = false;
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

    /** Envia inteiros os descritores próprios `'always'` do recurso (os de pool são marcados na mutação). */
    private uploadOwn(resource: Resource): void {
        if (trackedOf(resource)?.own !== true) return;
        const own = this.ownForWrite(resource);
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
            if (allocation.sharedKey !== undefined) {
                this.releaseSharedGeometry(allocation.sharedKey);
                delete allocation.sharedKey;
            } else if (allocation.buffer !== undefined) this.core.destroy(allocation.buffer);
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

/** O descritor guarda slots de outro Resource (`slotRefs` com `ref:`)? */
function refersOthers(desc: GPUDescriptor): boolean {
    return (
        desc.slotRefs !== undefined
        && Object.values(desc.slotRefs).some((t) => t.startsWith('ref:'))
    );
}

/** `'self:body'` → `['self', 'body']`. */
function splitTarget(target: string): ['self' | 'ref', string] {
    const at = target.indexOf(':');
    return [target.slice(0, at) as 'self' | 'ref', target.slice(at + 1)];
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
function textureUsage(
    role: GPUDescriptor['role'],
    format: GPUTextureFormat,
    samples: number,
): number {
    const U = GPUTextureUsage;
    // Multiamostrada (MSAA): só alvo de render e leitura (sem cópia nem storage).
    if (samples > 1) return U.RENDER_ATTACHMENT | U.TEXTURE_BINDING;
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
    const value = (resource.data as Record<string, unknown>)[desc.id];
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
    const value = (resource.data as Record<string, unknown>)[desc.id];
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
    if ((desc.count ?? 1) === 1) return schema.pack(resource.data as Record<string, unknown>);
    return undefined;
}

/** `writeBuffer` exige tamanho múltiplo de 4: completa com zeros quando necessário. */
function padTo4(view: ArrayBufferView): ArrayBufferView {
    if (view.byteLength % 4 === 0) return view;
    const out = new Uint8Array(alignUp(view.byteLength, 4));
    out.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    return out;
}

/** Põe o ocupante no slot mantendo o array denso (lacunas viram `undefined` explícito, sem elementos esparsos). */
function occupy(entry: PoolEntry, slot: number, occupant: Occupant): void {
    const list = entry.occupants;
    while (list.length < slot) list.push(undefined);
    list[slot] = occupant;
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
        && a.every(
            ([k, [t, d, o]]) =>
                b[k]?.[0] === t && b[k][1] === d && b[k][2]?.optional === o?.optional,
        )
    );
}
