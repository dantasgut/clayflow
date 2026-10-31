import type {
    AnyBufferSpec,
    BindGroupSpec,
    EngineCore,
    StorageBufferSpec,
} from '../../../core/contracts/index';
import type { BindableBufferSpec, ResolvedSource } from '../../consumers/ResolvedSource';
import type { ConsumerResolverRegistry } from '../../consumers/ConsumerResolverRegistry';
import type { PoolDirectory } from '../../contracts/PoolDirectory';
import type { Resource } from '../../contracts/Resource';
import type { Entity } from '../../contracts/Entity';
import type { PipelineDescriptor } from '../../descriptors/PipelineDescriptor';
import type { Schema } from '../../descriptors/Schema';
import type { PointImplementation } from '../../shaders/WgslPoint';
import type { WgslResource } from '../../shaders/WgslResource';
import type { EventBus } from '../../events/EventBus';
import { deliverFlowEvent, flowHandles, setFlowLifecycle, type Flow } from '../../flows/Flow';
import { FlowBindingError } from '../../flows/FlowBindingError';
import { bindingKeyParts } from '../../flows/FlowBinding';
import type {
    BindingSource,
    BindingSources,
    BoundFlow,
    PreparedCompute,
    PreparedPipeline,
    PreparedRender,
    TransitionContext,
} from '../../flows/FlowBinding';
import type { RegisterOptions } from '../../flows/FlowRegistry';
import type { FlowEvent } from '../../flows/FlowTransitions';
import type {
    BoundChannel,
    BoundEntities,
    BoundPool,
    BoundSingleton,
    BoundTarget,
    BoundTexture,
    BoundWork,
    ChannelSlot,
    EntitiesSlot,
    EntityEntry,
    EntityRecordDeclaration,
    ResourceType,
    SlotDeclaration,
    TextureRef,
} from '../../flows/slots';
import type { World } from '../../world/World';
import type { EntityId } from '../../world/EntityId';
import type { LayoutInferencer, InferredEntry } from '../LayoutInferencer';
import type { ResourceDirectory } from '../../contracts/ResourceDirectory';
import { EntityGroups, type GroupMember, type InstanceListHost } from './EntityGroups';
import type { PendingWork } from '../../events/EventMap';
import { PipelineState } from './PipelineState';
import type { ScenePoints } from './ScenePoints';
import { normalizeSource } from './sources';
import { boundChannelOf, channelSourceOf } from './channelBinding';

/** O que o runtime de um Flow usa da C2 (implementado pelo `ResourceSystem`). */
export interface FlowResourceHost extends ResourceDirectory, InstanceListHost {
    acquireEntityRecords(all: readonly ResourceType[], declaration: EntityRecordDeclaration): void;
    releaseEntityRecords(declaration: EntityRecordDeclaration): void;
    acquireOwnership(owner: object, resource: Resource, descId: string): void;
    releaseOwnership(owner: object, resource: Resource, descId: string): void;
    markProduced(owner: object, resource: Resource, descId: string, produced: boolean): void;
    poolEntityBySlot(poolKey: string, slot: number): EntityId | undefined;
}

/** O que o runtime de um Flow usa da cena. */
export interface FlowRuntimeHost {
    readonly core: EngineCore;
    readonly world: World;
    readonly resources: FlowResourceHost;
    readonly consumers: ConsumerResolverRegistry;
    readonly events: EventBus;
    readonly inferencer: LayoutInferencer;
    /** Funções dos pontos de cena (spec 009), compostas nos pipelines que contêm o ponto. */
    readonly scenePoints: ScenePoints;
}

/**
 * Estado da Camada 2 para um Flow alocado (`ensureFlowAllocated`): slots resolvidos, conjuntos de entidades,
 * bindings privados, pipelines preparados e o ciclo de vida. `reconcile()` resolve os slots, prepara os pipelines,
 * recria bind groups de fontes recriadas e anuncia `flowReady`/`flowSuspended`; os eventos chegam ao Flow pela tabela
 * de transições dele.
 */
export class FlowRuntime {
    /** Algo mudou desde o último `reconcile` (fontes, slots, compilação). */
    dirty = true;
    /** Slot obrigatório sem valor na última reconciliação (`undefined` com todos resolvidos). */
    private missingSlot: string | undefined;
    /**
     * O recurso do slot ausente está no mundo (avaliado na reconciliação, que roda a cada mudança da cena — nenhuma
     * consulta ao mundo por quadro).
     */
    private missingPresent = false;
    private readonly slotValues: Record<string, unknown> = {};
    /** Fontes privadas por recurso (todos os pipelines). */
    private readonly privates = new Map<WgslResource, BindingSource>();
    /** Fontes privadas por pipeline e recurso (vencem as de todos). */
    private readonly pipelinePrivates = new Map<string, Map<WgslResource, BindingSource>>();
    private readonly pipelineStates = new Map<string, PipelineState>();
    private readonly entitySets = new Map<string, Map<EntityId, SetEntry>>();
    /** O Resource de trabalho de cada slot `work`, inserido no World com o Flow (spec 039). */
    private readonly works = new Map<string, Resource>();
    private readonly poolViews = new Map<string, BoundPool>();
    private readonly entityViews = new Map<string, BoundEntities>();
    /** Lista das entradas por slot, refeita só quando o conjunto muda. */
    private readonly entityCaches = new Map<string, readonly EntityEntry[]>();
    /** Grupos de instâncias por slot `entities` com `groups`. */
    private readonly groupSets = new Map<string, EntityGroups>();
    /** Mudanças de entidades por slot desde o último `entitiesChanged` (entregues por quadro). */
    private readonly pendingChanges = new Map<
        string,
        { readonly added: Set<EntityId>; readonly removed: Set<EntityId> }
    >();
    private readonly compiledQueue: string[] = [];
    /** Pipelines rejeitados pelo compilador (`verify`), a anunciar no próximo `reconcile`. */
    private readonly rejectedQueue: string[] = [];
    /** Descritor de cada pipeline como o Flow o declarou (antes das funções de cena). */
    private readonly baseDescriptors = new Map<string, PipelineDescriptor>();
    /**
     * Pipelines refeitos com as funções de cena novas (spec 009), compilando: trocam o atual quando prontos; rejeitados,
     * são descartados (o atual continua).
     */
    private readonly nextStates = new Map<string, PipelineState>();
    private readonly swapQueue: string[] = [];
    private readonly nextRejected: string[] = [];
    /** `epoch` de cada canal dos slots na última resolução (spec 037). */
    private readonly channelEpochs = new Map<BoundChannel, number>();
    /** Visão de cada canal resolvido (estável: a identidade do slot). */
    private readonly channelViews = new WeakMap<object, BoundChannel>();
    /** Identidade dos slots opcionais na última resolução. */
    private readonly slotIdentity = new Map<string, unknown>();
    /** Slots opcionais que mudaram na última resolução. */
    private readonly changedSlots: string[] = [];
    readonly bound: BoundFlow;
    private readonly ctx: TransitionContext;
    /** Pools dos slots (para entregar `poolReallocated`). */
    readonly slotPools: ReadonlySet<string>;
    readonly hasTarget: boolean;
    readonly hasEntities: boolean;
    /** A tabela do Flow declara `frameRecorded`. */
    private readonly wantsFrameRecorded: boolean;
    /** A tabela do Flow declara `framePrepare`. */
    private readonly wantsFramePrepare: boolean;

    constructor(
        private readonly host: FlowRuntimeHost,
        readonly flow: Flow,
        readonly options: RegisterOptions,
    ) {
        if (flow.bindings !== undefined) this.storePrivates(flow.bindings);
        const pools = new Set<string>();
        for (const decl of Object.values(flow.slots)) {
            if (decl.kind === 'pool') pools.add(decl.poolKey);
            else if (decl.kind === 'bodies') pools.add(this.bodyType());
            else if (decl.kind === 'pools') for (const k of decl.poolKeys) pools.add(k);
            else if (decl.kind === 'channel' && decl.poolKey !== undefined) pools.add(decl.poolKey);
        }
        this.slotPools = pools;
        const decls = Object.values(flow.slots);
        this.hasTarget = decls.some((d) => d.kind === 'target');
        this.hasEntities = decls.some((d) => d.kind === 'entities');
        this.wantsFrameRecorded = flowHandles(flow, 'frameRecorded');
        this.wantsFramePrepare = flowHandles(flow, 'framePrepare');
        // O Resource de trabalho de cada `slot.work` entra no World com o Flow (spec 039) e sai no `dispose`.
        for (const [name, decl] of Object.entries(flow.slots)) {
            if (decl.kind !== 'work') continue;
            const resource = decl.create();
            this.works.set(name, resource);
            host.world.insert(resource as unknown as Entity);
        }
        for (const [name, decl] of Object.entries(flow.slots)) {
            if (decl.kind !== 'entities') continue;
            if (decl.record !== undefined)
                host.resources.acquireEntityRecords(decl.all, decl.record);
            const set = new Map<EntityId, SetEntry>();
            this.entitySets.set(name, set);
            const groups =
                decl.groups === undefined
                    ? undefined
                    : new EntityGroups(decl.groups, host.resources);
            if (groups !== undefined) this.groupSets.set(name, groups);
            for (const record of host.world.allRecords()) {
                const entry = this.entryFor(record.id, decl);
                if (entry === undefined) continue;
                set.set(record.id, entry);
                this.entered(decl, entry, groups);
            }
        }
        const states = this.pipelineStates;
        this.bound = {
            slots: this.slotValues as BoundFlow['slots'],
            pipelines: states as unknown as ReadonlyMap<string, PreparedPipeline>,
            compute: (id) => this.preparedOf(id, 'compute') as PreparedCompute,
            render: (id) => this.preparedOf(id, 'render') as PreparedRender,
        };
        this.ctx = {
            bound: this.bound,
            bind: (sources) => {
                this.bindPrivates(sources);
            },
            prepare: (descriptor) => this.prepare(descriptor, false).asPrepared(),
            release: (id) => {
                this.releasePipeline(id);
            },
            produced: (resource, descId, produced) => {
                this.host.resources.markProduced(this.flow, resource, descId, produced);
            },
        };
    }

    /** Tipo de corpo do registro (`slot.bodies()`). */
    bodyType(): string {
        const bodyType = this.options.bodyType;
        if (bodyType === undefined) {
            throw new FlowBindingError(
                `Flow '${this.flow.type}': slot bodies() exige registro com bodyType.`,
                { flow: this.flow.type, pipeline: '' },
            );
        }
        return bodyType;
    }

    /** Entrega um evento ao Flow (tabela de transições). */
    deliver(event: FlowEvent): void {
        if (this.flow.lifecycle === 'disposed') return;
        deliverFlowEvent(this.flow, event, this.ctx);
    }

    /** Evento de domínio: entregue só com os slots resolvidos (`preparing`/`ready`). */
    deliverDomain(event: FlowEvent): void {
        const l = this.flow.lifecycle;
        if (l === 'preparing' || l === 'ready') this.deliver(event);
    }

    /**
     * Resolve slots, prepara e atualiza pipelines e muda o ciclo de vida. Idempotente; trabalha só quando `dirty`.
     */
    reconcile(force = false): void {
        if (this.flow.lifecycle === 'disposed') return;
        // Fatias de canal recriadas (redimensionamento, `redescribe`, crescimento): as fontes mudam (spec 037).
        if (!this.dirty && !force && !this.channelsMoved()) return;
        this.dirty = false;
        const missing = this.resolveSlots();
        this.missingSlot = missing;
        this.missingPresent =
            missing !== undefined && this.slotResourcePresent(this.flow.slots[missing]!);
        if (missing !== undefined) {
            if (this.flow.lifecycle !== 'pending') {
                this.leave('pending');
                this.deliver({ type: 'slotLost', slot: missing });
            }
            return;
        }
        if (this.flow.lifecycle === 'pending') {
            setFlowLifecycle(this.flow, 'preparing');
            this.deliver({ type: 'slotsResolved' });
            for (const descriptor of this.flow.pipelines) this.prepare(descriptor, true);
        } else {
            for (const name of this.changedSlots) this.deliver({ type: 'slotChanged', slot: name });
        }
        for (const state of [...this.pipelineStates.values()]) {
            state.refresh(this.lookup, this.onReplaced);
        }
        for (const [id, next] of this.nextStates) {
            next.refresh(this.lookup, this.onReplaced);
            // Compilado de forma síncrona (sem conferência nem `preferAsync`): troca já neste reconcile.
            if (next.ready && !this.swapQueue.includes(id)) this.swapQueue.push(id);
        }
        while (this.nextRejected.length > 0) {
            const id = this.nextRejected.shift()!;
            const next = this.nextStates.get(id);
            if (next?.rejected == null) continue;
            announceRejection(this.host.events, next, next.descriptor.extensions ?? []);
            next.release();
            this.nextStates.delete(id);
        }
        while (this.swapQueue.length > 0) {
            const id = this.swapQueue.shift()!;
            const next = this.nextStates.get(id);
            if (next?.ready !== true) continue;
            this.pipelineStates.get(id)?.release();
            this.pipelineStates.set(id, next);
            this.nextStates.delete(id);
        }
        while (this.rejectedQueue.length > 0) {
            const id = this.rejectedQueue.shift()!;
            const state = this.pipelineStates.get(id);
            if (state?.rejected == null) continue;
            announceRejection(this.host.events, state, state.descriptor.extensions ?? []);
            const base = this.baseDescriptors.get(id);
            if (base !== undefined && base !== state.descriptor && base.verify !== true) {
                // Só as funções de cena compostas pela C2 foram rejeitadas: o pipeline volta ao pronto, sem envolver o
                // Flow (que não pediu conferência).
                state.release();
                const fallback = this.createState(id, base, state.declared);
                this.pipelineStates.set(id, fallback);
                fallback.refresh(this.lookup, this.onReplaced);
                continue;
            }
            this.deliverDomain({ type: 'pipelineRejected', pipeline: id });
        }
        while (this.compiledQueue.length > 0) {
            const id = this.compiledQueue.shift()!;
            const state = this.pipelineStates.get(id);
            if (state !== undefined && !state.declared && state.ready) {
                this.deliverDomain({ type: 'pipelinesCompiled', pipeline: id });
            }
        }
        const declaredReady = [...this.pipelineStates.values()]
            .filter((s) => s.declared)
            .every((s) => s.ready);
        if (this.flow.lifecycle === 'preparing' && declaredReady) {
            setFlowLifecycle(this.flow, 'ready');
            this.deliver({ type: 'pipelinesCompiled' });
            this.host.events.emit('flowReady', {
                payload: {
                    type: this.flow.type,
                    ...(this.options.bodyType !== undefined
                        ? { bodyType: this.options.bodyType }
                        : {}),
                    flow: this.flow,
                    bound: this.bound,
                },
            });
        } else if (this.flow.lifecycle === 'ready' && !declaredReady) {
            this.leave('preparing');
        }
    }

    /** Algum canal ligado trocou de fatias (o `epoch` mudou) desde a última resolução? */
    private channelsMoved(): boolean {
        for (const [channel, epoch] of this.channelEpochs) if (channel.epoch !== epoch) return true;
        return false;
    }

    /** Quadro prestes a ser gravado: entrega `framePrepare` ao Flow pronto que declara o evento. */
    framePrepare(): void {
        if (this.wantsFramePrepare && this.flow.lifecycle === 'ready')
            this.deliver({ type: 'framePrepare' });
    }

    /** Quadro enviado: entrega `frameRecorded` ao Flow pronto que declara o evento. */
    frameRecorded(): void {
        if (this.wantsFrameRecorded && this.flow.lifecycle === 'ready')
            this.deliver({ type: 'frameRecorded' });
    }

    /** Entidades inseridas: atualiza os slots `entities` agora; o `entitiesChanged` sai agregado no quadro. */
    entitiesInserted(ids: readonly EntityId[]): void {
        for (const [name, set] of this.entitySets) {
            const decl = this.flow.slots[name] as EntitiesSlot;
            let changed = false;
            const groups = this.groupSets.get(name);
            for (const id of ids) {
                // Já no conjunto (ex.: visto na criação do runtime, no mesmo quadro da inserção): uma entrada só.
                if (set.has(id)) continue;
                const entry = this.entryFor(id, decl);
                if (entry === undefined) continue;
                set.set(id, entry);
                this.entered(decl, entry, groups);
                this.changesOf(name).added.add(id);
                changed = true;
            }
            if (changed) this.entityCaches.delete(name);
        }
    }

    /** Entidades removidas: atualiza os slots `entities` agora; o `entitiesChanged` sai agregado no quadro. */
    entitiesRemoved(ids: readonly EntityId[]): void {
        for (const [name, set] of this.entitySets) {
            let changed = false;
            const groups = this.groupSets.get(name);
            for (const id of ids) {
                const entry = set.get(id);
                if (entry === undefined) continue;
                set.delete(id);
                if (groups !== undefined) groups.remove(entry);
                const changes = this.changesOf(name);
                // Entrou e saiu no mesmo quadro: o Flow nunca a viu.
                if (!changes.added.delete(id)) changes.removed.add(id);
                changed = true;
            }
            if (changed) this.entityCaches.delete(name);
        }
    }

    /**
     * Entidades recompostas (`World.attach`/`detach`): cada conjunto reavalia a entidade com os recursos de agora — ela
     * entra, sai ou troca de entrada (saída e entrada no mesmo `entitiesChanged`, para o Flow refazer o que guardou
     * dela).
     */
    entitiesRecomposed(ids: readonly EntityId[]): void {
        for (const [name, set] of this.entitySets) {
            const decl = this.flow.slots[name] as EntitiesSlot;
            const groups = this.groupSets.get(name);
            let changed = false;
            for (const id of ids) {
                const old = set.get(id);
                const entry = this.entryFor(id, decl);
                if (old === undefined && entry === undefined) continue;
                if (old !== undefined) {
                    set.delete(id);
                    if (groups !== undefined) groups.remove(old);
                }
                if (entry !== undefined) {
                    set.set(id, entry);
                    this.entered(decl, entry, groups);
                }
                const changes = this.changesOf(name);
                if (old !== undefined && entry !== undefined) {
                    // Já entrou neste quadro: continua só como entrada (com os recursos novos).
                    if (!changes.added.has(id)) {
                        changes.removed.add(id);
                        changes.added.add(id);
                    }
                } else if (old !== undefined) {
                    if (!changes.added.delete(id)) changes.removed.add(id);
                } else {
                    changes.added.add(id);
                }
                changed = true;
            }
            if (changed) this.entityCaches.delete(name);
        }
    }

    /** A entrada entrou no conjunto: grupo de instâncias e posse da GPU declarados no slot. */
    private entered(decl: EntitiesSlot, entry: SetEntry, groups: EntityGroups | undefined): void {
        for (const [type, descId] of decl.owns ?? []) {
            this.host.resources.acquireOwnership(decl, entry.get(type), descId);
        }
        groups?.add(entry);
    }

    /**
     * Faixas de um pool enviadas: reavalia a chave de grupo das entidades dos conjuntos com `groups` cujos slots foram
     * escritos (ex.: escala de um `Transform` que inverte a face).
     */
    poolWritten(
        poolKey: string,
        schemaName: string,
        ranges: readonly (readonly [number, number])[],
        fields: readonly string[] | undefined,
    ): void {
        if (this.groupSets.size === 0) return;
        const resources = this.host.resources;
        for (const [name, groups] of this.groupSets) {
            const decl = this.flow.slots[name] as EntitiesSlot;
            if (poolKey === decl.groups?.schema.name || poolKey === decl.record?.schema.name)
                continue;
            // Só os campos declarados podem mudar a chave (ex.: a escala do Transform; posição e rotação não).
            const watched = decl.groups?.rekeyOn?.[schemaName];
            if (
                watched !== undefined
                && fields !== undefined
                && !fields.some((f) => watched.includes(f))
            )
                continue;
            const set = this.entitySets.get(name)!;
            for (const [first, count] of ranges) {
                for (let slot = first; slot < first + count; slot++) {
                    const id = resources.poolEntityBySlot(poolKey, slot);
                    const entry = id === undefined ? undefined : set.get(id);
                    if (entry !== undefined) groups.rekey(entry);
                }
            }
        }
    }

    /** Resource com objetos próprios enviado (ex.: geometria com conteúdo novo): reavalia o grupo da entidade. */
    resourceUploaded(resource: Resource): void {
        if (this.groupSets.size === 0) return;
        const id = this.host.world.entityIdOfResource(resource);
        if (id === undefined) return;
        for (const [name, groups] of this.groupSets) {
            const entry = this.entitySets.get(name)!.get(id);
            if (entry !== undefined) groups.rekey(entry);
        }
    }

    /** Entrega um `entitiesChanged` por slot com as mudanças acumuladas (antes de `framePrepare`). */
    deliverEntityChanges(): void {
        if (this.pendingChanges.size === 0) return;
        const pending = [...this.pendingChanges];
        this.pendingChanges.clear();
        for (const [slot, { added, removed }] of pending) {
            if (added.size === 0 && removed.size === 0) continue;
            this.deliverDomain({
                type: 'entitiesChanged',
                slot,
                added: [...added],
                removed: [...removed],
            });
        }
    }

    private changesOf(name: string): { added: Set<EntityId>; removed: Set<EntityId> } {
        let changes = this.pendingChanges.get(name);
        if (changes === undefined) {
            changes = { added: new Set(), removed: new Set() };
            this.pendingChanges.set(name, changes);
        }
        return changes;
    }

    /** O Flow declara `schema` (ou uma família que o contém: os registros de um ponto) em `listens`? */
    listens(schema: Schema): boolean {
        return this.flow.listens.some(
            (l) => l === schema || ('isRecord' in l && l.isRecord(schema)),
        );
    }

    /** O Flow escuta `resource` (algum descritor com schema de `listens`)? Devolve o schema, ou `undefined`. */
    listenedSchema(resource: Resource): Schema | undefined {
        const listens = this.flow.listens;
        if (listens.length === 0) return undefined;
        for (const d of resource.getDescriptors()) {
            if (d.schema !== undefined && this.listens(d.schema)) return d.schema;
        }
        return undefined;
    }

    /** Libera pipelines e o Flow; anuncia `flowSuspended` se estava pronto. */
    dispose(): void {
        if (this.flow.lifecycle === 'disposed') return;
        if (this.flow.lifecycle === 'ready') {
            this.host.events.emit('flowSuspended', {
                payload: { type: this.flow.type, flow: this.flow },
            });
        }
        for (const state of this.pipelineStates.values()) state.release();
        this.pipelineStates.clear();
        for (const state of this.nextStates.values()) state.release();
        this.nextStates.clear();
        for (const groups of this.groupSets.values()) groups.dispose();
        this.groupSets.clear();
        for (const [name, decl] of Object.entries(this.flow.slots)) {
            if (decl.kind !== 'entities') continue;
            for (const entry of this.entitySets.get(name)?.values() ?? []) {
                for (const [type, descId] of decl.owns ?? [])
                    this.host.resources.releaseOwnership(decl, entry.get(type), descId);
            }
            if (decl.record !== undefined) this.host.resources.releaseEntityRecords(decl.record);
        }
        setFlowLifecycle(this.flow, 'disposed');
        this.flow.dispose();
        for (const resource of this.works.values())
            this.host.world.remove(resource as unknown as Entity);
        this.works.clear();
    }

    private leave(to: 'pending' | 'preparing'): void {
        const wasReady = this.flow.lifecycle === 'ready';
        setFlowLifecycle(this.flow, to);
        if (wasReady) {
            this.host.events.emit('flowSuspended', {
                payload: { type: this.flow.type, flow: this.flow },
            });
        }
    }

    private bindPrivates(sources: BindingSources): void {
        this.storePrivates(sources);
        this.dirty = true;
    }

    private storePrivates(sources: BindingSources): void {
        for (const [key, source] of sources) {
            const { pipeline, resource } = bindingKeyParts(key);
            if (resource.resource.provider !== 'private') {
                throw new FlowBindingError(
                    `fonte privada para '${resource.name}' no Flow '${this.flow.type}', mas o recurso tem fornecedor — troque o pool com 'pools' no descritor.`,
                    { flow: this.flow.type, pipeline: pipeline ?? '', variable: resource.name },
                );
            }
            if (pipeline === undefined) {
                this.privates.set(resource, source);
                continue;
            }
            let byResource = this.pipelinePrivates.get(pipeline);
            if (byResource === undefined)
                this.pipelinePrivates.set(pipeline, (byResource = new Map()));
            byResource.set(resource, source);
        }
    }

    private prepare(descriptor: PipelineDescriptor, declared: boolean): PipelineState {
        const existing = this.pipelineStates.get(descriptor.id);
        if (existing !== undefined) return existing;
        this.baseDescriptors.set(descriptor.id, descriptor);
        const state = this.createState(descriptor.id, this.withScene(descriptor), declared);
        this.pipelineStates.set(descriptor.id, state);
        if (this.flow.lifecycle === 'preparing' || this.flow.lifecycle === 'ready') {
            state.refresh(this.lookup, this.onReplaced);
        }
        this.dirty = true;
        return state;
    }

    /** Estado de pipeline com os avisos de compilação e de rejeição deste runtime. */
    private createState(
        id: string,
        descriptor: PipelineDescriptor,
        declared: boolean,
    ): PipelineState {
        return new PipelineState(
            id,
            descriptor,
            declared,
            this.flow.type,
            this.host.core,
            this.host.inferencer,
            () => this.host.core.canvasFormat,
            (s) => {
                this.compiledQueue.push(s.id);
                this.dirty = true;
            },
            (s) => {
                this.rejectedQueue.push(s.id);
                this.dirty = true;
            },
            (s, message) => {
                this.pipelineFailed(s, message);
            },
        );
    }

    /** Compilação ou conferência que falhou no device: vira `engineError` com o nome do Flow e do pipeline. */
    private pipelineFailed(state: PipelineState, message: string): void {
        if (this.flow.lifecycle === 'disposed') return;
        this.host.events.emit('engineError', {
            stage: 'pipeline',
            filter: 'internal',
            message: `Flow '${this.flow.type}', pipeline '${state.id}': ${message}`,
        });
        this.dirty = true;
    }

    /**
     * O que este Flow ainda espera para o quadro sair completo (prontidão do motor, spec 034): pipelines sem fonte,
     * em conferência ou compilando, e trocas pela composição nova da cena ainda não concluídas. Flow sem os slots
     * obrigatórios (`pending`) não entra: o recurso que ele desenha não está na cena.
     */
    pendingWork(): PendingWork[] {
        const l = this.flow.lifecycle;
        if (l === 'pending') {
            // Sem um slot obrigatório: só conta se o recurso dele já está na cena (falta o envio, o pool ou o que outro
            // Flow produz); ausente da cena, o Flow não tem o que fazer.
            const name = this.missingSlot;
            if (name === undefined || !this.missingPresent) return [];
            return [{ flow: this.flow.type, pipeline: `slot:${name}`, reason: 'waiting', name }];
        }
        if (l !== 'preparing' && l !== 'ready') return [];
        const out: PendingWork[] = [];
        for (const state of this.pipelineStates.values()) {
            const reason = state.pending;
            if (reason === undefined) continue;
            out.push({
                flow: this.flow.type,
                pipeline: state.id,
                reason,
                ...(reason === 'waiting' && state.missing !== undefined
                    ? { name: state.missing }
                    : {}),
            });
        }
        for (const [id, next] of this.nextStates) {
            if (next.rejected !== null || next.failed !== null) continue;
            out.push({ flow: this.flow.type, pipeline: id, reason: 'swapping' });
        }
        return out;
    }

    private releasePipeline(id: string): void {
        const state = this.pipelineStates.get(id);
        if (state === undefined) return;
        state.release();
        this.pipelineStates.delete(id);
        this.nextStates.get(id)?.release();
        this.nextStates.delete(id);
        this.baseDescriptors.delete(id);
    }

    /** O descritor com as funções de cena dos pontos que o shader contém (conferido pelo compilador, com elas). */
    private withScene(descriptor: PipelineDescriptor): PipelineDescriptor {
        const bound = this.host.scenePoints.bind(descriptor.shader, (fns, message) => {
            // A composição não monta neste kernel (ex.: símbolo da função em conflito com o do solver): a cena anuncia,
            // e o pipeline segue com o pronto.
            for (const fn of fns) {
                this.host.events.emit('extensionRejected', {
                    point: fn.point.name,
                    resource: fn,
                    revision: fn.revision,
                    message,
                    line: 0,
                    pipeline: descriptor.id,
                });
            }
        });
        if (bound.shader === descriptor.shader) return descriptor;
        // Contribuições de cena (spec 031) são código do motor; funções do usuário pedem a conferência do compilador.
        if (bound.extensions.length === 0) return { ...descriptor, shader: bound.shader };
        return {
            ...descriptor,
            shader: bound.shader,
            verify: true,
            extensions: [...(descriptor.extensions ?? []), ...bound.extensions],
        };
    }

    /**
     * As funções de cena (spec 009) ou as contribuições de cena (spec 031) mudaram: cada pipeline cujo shader muda com
     * a composição atual é preparado de novo e troca o atual quando compila (rejeitado, o atual continua).
     */
    sceneChanged(): void {
        for (const [id, state] of this.pipelineStates) {
            const base = this.baseDescriptors.get(id);
            if (base === undefined) continue;
            const descriptor = this.withScene(base);
            const target = this.nextStates.get(id) ?? state;
            if (descriptor.shader === target.descriptor.shader) continue;
            this.nextStates.get(id)?.release();
            const next = new PipelineState(
                id,
                descriptor,
                state.declared,
                this.flow.type,
                this.host.core,
                this.host.inferencer,
                () => this.host.core.canvasFormat,
                (s) => {
                    this.swapQueue.push(s.id);
                    this.dirty = true;
                },
                (s) => {
                    this.nextRejected.push(s.id);
                    this.dirty = true;
                },
                (s, message) => {
                    // A troca falhou: o atual continua, como na rejeição.
                    this.pipelineFailed(s, message);
                    if (this.nextStates.get(s.id) === s) {
                        s.release();
                        this.nextStates.delete(s.id);
                    }
                },
            );
            this.nextStates.set(id, next);
            this.dirty = true;
        }
    }

    /** Fonte de um binding: pelo fornecedor do recurso declarado (spec 031). */
    private readonly lookup = (
        entry: InferredEntry,
        group: number,
        state: PipelineState,
    ): ResolvedSource | undefined =>
        this.declaredSource(entry, group, state, this.baseDescriptors.get(state.id));

    /** Fonte de um recurso declarado (spec 031): pelo fornecedor da declaração. */
    private declaredSource(
        entry: InferredEntry,
        group: number,
        state: PipelineState,
        base: PipelineDescriptor | undefined,
    ): ResolvedSource | undefined {
        const declared = entry.declared;
        if (declared === undefined) {
            throw new FlowBindingError(
                `binding '${entry.name}' do pipeline '${state.id}' do Flow '${this.flow.type}' sem recurso declarado.`,
                { flow: this.flow.type, pipeline: state.id, group, variable: entry.name },
            );
        }
        const ctx = { world: this.host.world, resources: this.host.resources };
        const poolOverride = state.descriptor.pools?.get(declared);
        if (poolOverride !== undefined) {
            return this.host.consumers.has(poolOverride)
                ? this.host.consumers.resolve(poolOverride, ctx)
                : undefined;
        }
        const provider = declared.resource.provider;
        if (provider === 'private') {
            const priv =
                this.pipelinePrivates.get(state.id)?.get(declared) ?? this.privates.get(declared);
            if (priv !== undefined) return normalizeSource(priv);
            throw new FlowBindingError(
                `recurso privado '${entry.name}' (@group(${group}) @binding(${entry.binding})) do pipeline '${state.id}' do Flow '${this.flow.type}' sem fonte: ligue-o com ctx.bind.`,
                {
                    flow: this.flow.type,
                    pipeline: state.id,
                    group,
                    binding: entry.binding,
                    variable: entry.name,
                },
            );
        }
        if ('scene' in provider) {
            return base === undefined
                ? undefined
                : this.host.scenePoints.globalSource(base.shader, entry.name);
        }
        if ('slot' in provider) return this.slotSource(provider, entry, state);
        const name = 'pool' in provider ? provider.pool : provider.consumer;
        // Pool ou resolver ainda ausente na cena: o pipeline espera.
        if (!this.host.consumers.has(name)) return undefined;
        return this.host.consumers.resolve(name, ctx);
    }

    /** Fonte de um recurso fornecido por um slot do Flow (spec 031). */
    private slotSource(
        provider: {
            readonly slot: string;
            readonly part?: string;
            readonly descriptor?: string;
            readonly lag?: number;
        },
        entry: InferredEntry,
        state: PipelineState,
    ): ResolvedSource | undefined {
        const decl = (this.flow.slots as Record<string, SlotDeclaration | undefined>)[
            provider.slot
        ];
        if (decl === undefined) {
            throw new FlowBindingError(
                `recurso '${entry.name}' do pipeline '${state.id}' do Flow '${this.flow.type}' fornecido pelo slot '${provider.slot}', que o Flow não declara.`,
                { flow: this.flow.type, pipeline: state.id, variable: entry.name },
            );
        }
        const value = this.slotValues[provider.slot];
        if (value === undefined) return undefined;
        const buffer = (
            b: StorageBufferSpec | AnyBufferSpec | undefined,
        ): ResolvedSource | undefined =>
            b === undefined ? undefined : normalizeSource(b as BindingSource);
        switch (decl.kind) {
            case 'pool':
            case 'bodies': {
                const pool = value as BoundPool;
                return buffer(provider.part === 'live' ? pool.live : pool.buffer);
            }
            case 'entities': {
                const set = value as BoundEntities;
                const pool = provider.part === 'instances' ? set.instances : set.records;
                return buffer(pool?.buffer);
            }
            case 'singleton':
            case 'work': {
                const single = value as BoundSingleton;
                const d = provider.descriptor;
                if (d === undefined) return undefined;
                const b = single.bufferOf(d);
                const stride = this.host.resources.regionStrideOf(single.resource, d);
                if (b !== undefined && stride !== undefined) {
                    // Uniforme por região (spec 039): uma região do schema por ligação, escolhida pelo offset dinâmico.
                    const schema = single.resource
                        .getDescriptors()
                        .find((x) => x.id === d)!.schema!;
                    return {
                        kind: 'buffer',
                        buffer: b as BindableBufferSpec,
                        size: schema.stride,
                        dynamic: { stride },
                    };
                }
                if (b !== undefined) return buffer(b);
                const view = single.textureViewOf(d);
                if (view !== undefined) return normalizeSource(view);
                const sampler = single.samplerOf(d);
                return sampler === undefined ? undefined : normalizeSource(sampler);
            }
            case 'texture':
                return normalizeSource((value as BoundTexture).view);
            case 'channel': {
                const channel = value as BoundChannel;
                // Fatias ainda não pedidas (`ensureAllocated`): o pipeline espera.
                if (!channel.allocated) return undefined;
                return {
                    kind: 'channel',
                    channel: channelSourceOf(channel, `${this.flow.type}.${provider.slot}`),
                    lag: provider.lag ?? 0,
                    epoch: channel.epoch,
                };
            }
            default:
                throw new FlowBindingError(
                    `recurso '${entry.name}' do Flow '${this.flow.type}': o slot '${provider.slot}' (${decl.kind}) não fornece dado de shader.`,
                    { flow: this.flow.type, pipeline: state.id, variable: entry.name },
                );
        }
    }

    private readonly onReplaced = (
        state: PipelineState,
        group: number,
        oldSpec: BindGroupSpec,
        newSpec: BindGroupSpec,
    ): void => {
        this.host.events.emit('bindGroupReplaced', {
            flow: this.flow.type,
            pipeline: state.id,
            group,
            oldSpec,
            newSpec,
        });
        this.deliverDomain({
            type: 'bindGroupReplaced',
            pipeline: state.id,
            group,
            oldSpec,
            newSpec,
        });
    };

    private preparedOf(id: string, role: 'compute' | 'render'): PreparedPipeline {
        const state = this.pipelineStates.get(id);
        if (state?.role !== role) {
            throw new Error(`Flow '${this.flow.type}': pipeline de ${role} '${id}' não preparado.`);
        }
        return state.asPrepared();
    }

    /** Resolve todos os slots; devolve o nome do primeiro obrigatório ausente. */
    private resolveSlots(): string | undefined {
        let missing: string | undefined;
        this.changedSlots.length = 0;
        for (const [name, decl] of Object.entries(this.flow.slots)) {
            const value = this.resolveSlot(name, decl);
            this.slotValues[name] = value;
            if (value === undefined && this.isRequired(decl)) missing ??= name;
            if (!this.isRequired(decl) && decl.kind !== 'entities') {
                const key = this.identityOf(decl, value);
                if (this.slotIdentity.has(name) && this.slotIdentity.get(name) !== key) {
                    this.changedSlots.push(name);
                }
                this.slotIdentity.set(name, key);
            }
        }
        return missing;
    }

    /** Identidade do valor de um slot opcional (o que muda quando ele aparece, some ou troca de recurso). */
    private identityOf(decl: SlotDeclaration, value: unknown): unknown {
        if (value === undefined) return undefined;
        switch (decl.kind) {
            case 'pools':
                return [...(value as ReadonlyMap<string, BoundPool | undefined>).entries()]
                    .filter(([, v]) => v !== undefined)
                    .map(([k]) => k)
                    .join('|');
            case 'singleton':
                return (value as BoundSingleton).resource;
            case 'texture':
                return (value as BoundTexture).view;
            default:
                return value;
        }
    }

    /** O recurso de que o slot depende está no mundo (ainda que sem pool, textura ou envio)? */
    private slotResourcePresent(decl: SlotDeclaration): boolean {
        const world = this.host.world;
        const has = (schemaName: string): boolean => world.queryBySchemaName(schemaName).length > 0;
        switch (decl.kind) {
            case 'pool':
                return has(decl.poolKey);
            case 'bodies':
                return has(this.bodyType());
            case 'singleton':
                return has(decl.schema.name);
            case 'texture':
                return has(decl.schema.name);
            case 'channel':
                return has(decl.poolKey ?? decl.schema!.name);
            case 'target':
            case 'work':
                return true;
            case 'pools':
            case 'entities':
                return false;
        }
    }

    private isRequired(decl: SlotDeclaration): boolean {
        switch (decl.kind) {
            case 'pool':
            case 'singleton':
            case 'texture':
            case 'channel':
                return !decl.optional;
            case 'bodies':
            case 'target':
            case 'work':
                return true;
            case 'pools':
            case 'entities':
                return false;
        }
    }

    private resolveSlot(name: string, decl: SlotDeclaration): unknown {
        switch (decl.kind) {
            case 'pool':
                return this.poolView(decl.poolKey);
            case 'bodies':
                return this.poolView(this.bodyType());
            case 'pools':
                return new Map(decl.poolKeys.map((k) => [k, this.poolView(k)]));
            case 'singleton': {
                const resource = this.firstWithSchema(decl.schema, undefined, decl.select);
                return resource === undefined ? undefined : this.singletonView(resource);
            }
            case 'entities':
                return this.entitiesView(name);
            case 'texture':
                return this.textureOf(decl);
            case 'channel':
                return this.channelOf(decl);
            case 'target':
                return this.targetOf(decl.color, decl.depth, decl.samples);
            case 'work':
                return this.workView(name);
        }
    }

    private poolView(poolKey: string): BoundPool | undefined {
        const resources = this.host.resources;
        if (resources.poolInfo(poolKey) === undefined) return undefined;
        let view = this.poolViews.get(poolKey);
        if (view === undefined) {
            const info = () => resources.poolInfo(poolKey)!;
            view = {
                poolKey,
                get schema() {
                    return info().schema;
                },
                get buffer() {
                    return info().buffer;
                },
                get count() {
                    return resources.poolCount(poolKey);
                },
                get stride() {
                    return info().stride;
                },
                get capacity() {
                    return info().capacity;
                },
                get generation() {
                    return info().generation;
                },
                get gpuOwned() {
                    return info().gpuOwned;
                },
                get live() {
                    return resources.poolLiveBuffer(poolKey)!;
                },
                slotOf: (id) => resources.poolSlotOf(poolKey, id),
                rangeOf: (id) => resources.poolRangeOf(poolKey, id),
                ownedByGpu: (slot) => resources.poolSlotOwnedByGpu(poolKey, slot),
                entityAt: (slot) => resources.poolEntityBySlot(poolKey, slot),
            };
            this.poolViews.set(poolKey, view);
        }
        return view;
    }

    /** O Resource de trabalho do slot `name` como singleton, com o stride das regiões (spec 039). */
    private workView(name: string): BoundWork | undefined {
        const resource = this.works.get(name);
        if (resource === undefined) return undefined;
        const r = this.host.resources;
        return {
            ...this.singletonView(resource),
            regionStride: (descId) => {
                const stride = r.regionStrideOf(resource, descId);
                if (stride === undefined)
                    throw new Error(
                        `Flow '${this.flow.type}': o descritor '${descId}' do Resource de trabalho '${name}' não tem regions.`,
                    );
                return stride;
            },
        };
    }

    private singletonView(resource: Resource): BoundSingleton {
        const r = this.host.resources;
        return {
            resource,
            bufferOf: (descId) => r.bufferOf(resource, descId),
            textureViewOf: (descId) => r.textureViewOf(resource, descId),
            samplerOf: (descId) => r.samplerOf(resource, descId),
        };
    }

    private entitiesView(name: string): BoundEntities {
        let view = this.entityViews.get(name);
        if (view === undefined) {
            const set = this.entitySets.get(name)!;
            const cache = this.entityCaches;
            const decl = this.flow.slots[name] as EntitiesSlot;
            const record = decl.record;
            const records = (): BoundPool | undefined =>
                record === undefined ? undefined : this.poolView(record.schema.name);
            const groups = this.groupSets.get(name);
            const instances = (): BoundPool | undefined =>
                decl.groups === undefined ? undefined : this.poolView(decl.groups.schema.name);
            view = {
                get records() {
                    return records();
                },
                get groups() {
                    return groups?.drawGroups ?? [];
                },
                get instances() {
                    return instances();
                },
                get entries() {
                    let list = cache.get(name);
                    if (list === undefined) {
                        list = [...set.values()];
                        cache.set(name, list);
                    }
                    return list;
                },
                entry: (id) => set.get(id),
            };
            this.entityViews.set(name, view);
        }
        return view;
    }

    /**
     * O canal do slot (spec 037): existe desde a inserção do recurso (ou do pool); as fatias de um descritor sob demanda
     * nascem no pedido de quem o usa (`ensureAllocated`, `ensurePoolAllocated`) — os pipelines que ligam o canal esperam
     * até lá, e o `epoch` novo refaz a resolução.
     */
    private channelOf(decl: ChannelSlot): BoundChannel | undefined {
        const resources = this.host.resources;
        let info;
        let written: () => void;
        let invalidate: () => void;
        if (decl.poolKey !== undefined) {
            const key = decl.poolKey;
            info = resources.channelOfPool(key);
            written = () => {
                resources.markPoolWritten(key);
            };
            invalidate = () => {
                resources.invalidatePoolChannel(key);
            };
        } else {
            const descId = decl.descId!;
            const resource = this.firstWithSchema(decl.schema!, descId, decl.select);
            if (resource === undefined) return undefined;
            info = resources.channelOf(resource, descId);
            written = () => {
                resources.markWritten(resource, descId);
            };
            invalidate = () => {
                resources.invalidateChannel(resource, descId);
            };
        }
        if (info === undefined) return undefined;
        let view = this.channelViews.get(info);
        if (view === undefined) {
            view = boundChannelOf(info, written, invalidate);
            this.channelViews.set(info, view);
        }
        this.channelEpochs.set(view, view.epoch);
        return view;
    }

    private textureOf(ref: TextureRef): BoundTexture | undefined {
        const resource = this.firstWithSchema(ref.schema, ref.descId, ref.select);
        if (resource === undefined) return undefined;
        const texture = this.host.resources.textureOf(resource, ref.descId);
        const view = this.host.resources.textureViewOf(resource, ref.descId);
        return texture === undefined || view === undefined ? undefined : { texture, view };
    }

    private targetOf(
        color: 'canvas' | 'none' | TextureRef,
        depthRef: TextureRef | undefined,
        samplesRef: TextureRef | undefined,
    ): BoundTarget | undefined {
        let depth: BoundTexture | undefined;
        if (depthRef !== undefined) {
            depth = this.textureOf(depthRef);
            if (depth === undefined) return undefined;
        }
        // Amostras são opcionais: o Resource sem a textura de amostras dá um alvo sem MSAA.
        const samples = samplesRef === undefined ? undefined : this.textureOf(samplesRef);
        const sampleCount = samples?.texture.sampleCount ?? depth?.texture.sampleCount ?? 1;
        const extra = {
            ...(depth !== undefined
                ? { depth: depth.view, depthFormat: depth.texture.format }
                : {}),
            ...(samples !== undefined ? { samples: samples.view } : {}),
            sampleCount,
        };
        if (color === 'canvas')
            return { color: 'canvas', format: this.host.core.canvasFormat, ...extra };
        if (color === 'none') return { color: 'none', ...extra };
        const tex = this.textureOf(color);
        return tex === undefined
            ? undefined
            : { color: tex.view, format: tex.texture.format, ...extra };
    }

    /** Primeiro recurso (ordem de inserção) com um descritor de `schema` (e `descId`, se dado) que passa em `select`. */
    private firstWithSchema(
        schema: Schema,
        descId: string | undefined,
        select: ((r: Resource) => boolean) | undefined,
    ): Resource | undefined {
        const world = this.host.world;
        for (const id of world.queryBySchemaName(schema.name)) {
            for (const r of world.resourcesOf(id)) {
                const descs = r.getDescriptors();
                if (!hasSchema(r, schema)) continue;
                if (descId !== undefined && !descs.some((d) => d.id === descId)) continue;
                if (select === undefined || select(r)) return r;
            }
        }
        return undefined;
    }

    private entryFor(id: EntityId, decl: EntitiesSlot): SetEntry | undefined {
        const resources = this.host.world.resourcesOf(id);
        for (const type of decl.all)
            if (!resources.some((x) => x instanceof type)) return undefined;
        return new SetEntry(id, resources, decl, this.host.resources);
    }
}

/**
 * Entrada de um conjunto `entities`: métodos no protótipo, sem closures por entrada — há uma por entidade e por
 * conjunto (spec 007, US7: um milhão de entidades).
 */
class SetEntry implements GroupMember {
    groupOf: object | undefined = undefined;
    groupIndex = -1;

    constructor(
        readonly entityId: EntityId,
        readonly resources: readonly Resource[],
        private readonly decl: EntitiesSlot,
        private readonly directory: PoolDirectory,
    ) {}

    get recordSlot(): number | undefined {
        const key = this.decl.record?.schema.name;
        return key === undefined ? undefined : this.directory.poolSlotOf(key, this.entityId);
    }

    /** Recurso do tipo na entidade (poucos por entidade: busca linear, sem cópia por entrada). */
    get<T extends Resource>(type: ResourceType<T>): T {
        const r = this.resources.find((x) => x instanceof type);
        if (r === undefined)
            throw new Error(`EntityEntry: a entidade ${this.entityId} não tem o tipo pedido.`);
        return r as T;
    }
}

/** O recurso é do schema: o `schema` estático da classe (o que o World indexa) ou o de algum descritor. */
function hasSchema(resource: Resource, schema: Schema): boolean {
    if ((resource.constructor as { schema?: Schema }).schema === schema) return true;
    return resource.getDescriptors().some((d) => d.schema === schema);
}

/** Revisão já anunciada por função (uma rejeição por revisão, ainda que vários pipelines a usem). */
const announced = new WeakMap<PointImplementation, number>();

/**
 * Anuncia `extensionRejected` para cada função cujo módulo contém um erro do compilador, com a linha traduzida para o
 * código do usuário; erro fora das funções é atribuído à primeira (o shader só tem código de fora nelas).
 */
function announceRejection(
    events: EventBus,
    state: PipelineState,
    functions: readonly PointImplementation[],
): void {
    for (const error of state.rejected ?? []) {
        let owner: PointImplementation | undefined;
        let line = 0;
        for (const fn of functions) {
            const range = state.composed.ranges.get(fn.module.name);
            if (range === undefined || error.line < range.first || error.line > range.last)
                continue;
            owner = fn;
            line = Math.max(0, fn.codeLine(error.line - range.first + 1));
        }
        owner ??= functions[0];
        if (owner === undefined || announced.get(owner) === owner.revision) continue;
        announced.set(owner, owner.revision);
        events.emit('extensionRejected', {
            point: owner.point.name,
            resource: owner,
            revision: owner.revision,
            message: error.message,
            line,
            pipeline: state.id,
        });
    }
}
