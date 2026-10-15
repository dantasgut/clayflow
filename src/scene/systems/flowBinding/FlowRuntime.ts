import type { EngineCore, BindGroupSpec } from '../../../core/contracts/index';
import type { ResolvedSource } from '../../consumers/ResolvedSource';
import type { ConsumerResolverRegistry } from '../../consumers/ConsumerResolverRegistry';
import type { PoolDirectory } from '../../contracts/PoolDirectory';
import type { Resource } from '../../contracts/Resource';
import { consumesName, type PipelineDescriptor } from '../../descriptors/PipelineDescriptor';
import type { Schema } from '../../descriptors/Schema';
import type { PointImplementation } from '../../shaders/WgslPoint';
import type { EventBus } from '../../events/EventBus';
import { deliverFlowEvent, flowHandles, setFlowLifecycle, type Flow } from '../../flows/Flow';
import { FlowBindingError } from '../../flows/FlowBindingError';
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
    BoundEntities,
    BoundPool,
    BoundSingleton,
    BoundTarget,
    BoundTexture,
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
import { PipelineState } from './PipelineState';
import { normalizeSource } from './sources';

/** O que o runtime de um Flow usa da C2 (implementado pelo `ResourceSystem`). */
export interface FlowResourceHost extends ResourceDirectory, InstanceListHost {
    acquireEntityRecords(all: readonly ResourceType[], declaration: EntityRecordDeclaration): void;
    releaseEntityRecords(declaration: EntityRecordDeclaration): void;
    acquireOwnership(owner: object, resource: Resource, descId: string): void;
    releaseOwnership(owner: object, resource: Resource, descId: string): void;
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
    private readonly slotValues: Record<string, unknown> = {};
    private readonly privates = new Map<string, BindingSource>();
    private readonly pipelineStates = new Map<string, PipelineState>();
    private readonly entitySets = new Map<string, Map<EntityId, SetEntry>>();
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
        for (const [name, source] of Object.entries(flow.bindings)) this.privates.set(name, source);
        const pools = new Set<string>();
        for (const decl of Object.values(flow.slots)) {
            if (decl.kind === 'pool') pools.add(decl.poolKey);
            else if (decl.kind === 'bodies') pools.add(this.bodyType());
            else if (decl.kind === 'pools') for (const k of decl.poolKeys) pools.add(k);
        }
        this.slotPools = pools;
        const decls = Object.values(flow.slots);
        this.hasTarget = decls.some((d) => d.kind === 'target');
        this.hasEntities = decls.some((d) => d.kind === 'entities');
        this.wantsFrameRecorded = flowHandles(flow, 'frameRecorded');
        this.wantsFramePrepare = flowHandles(flow, 'framePrepare');
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
        if (this.flow.lifecycle === 'disposed' || (!this.dirty && !force)) return;
        this.dirty = false;
        const missing = this.resolveSlots();
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
        while (this.rejectedQueue.length > 0) {
            const id = this.rejectedQueue.shift()!;
            const state = this.pipelineStates.get(id);
            if (state?.rejected == null) continue;
            announceRejection(this.host.events, state, state.descriptor.extensions ?? []);
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

    /** O Flow declara `schema` em `listens`? */
    listens(schema: Schema): boolean {
        return this.flow.listens.includes(schema);
    }

    /** O Flow escuta `resource` (algum descritor com schema de `listens`)? Devolve o schema, ou `undefined`. */
    listenedSchema(resource: Resource): Schema | undefined {
        const listens = this.flow.listens;
        if (listens.length === 0) return undefined;
        for (const d of resource.getDescriptors()) {
            if (d.schema !== undefined && listens.includes(d.schema)) return d.schema;
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
        for (const [name, source] of Object.entries(sources)) this.privates.set(name, source);
        this.dirty = true;
    }

    private prepare(descriptor: PipelineDescriptor, declared: boolean): PipelineState {
        const existing = this.pipelineStates.get(descriptor.id);
        if (existing !== undefined) return existing;
        const state = new PipelineState(
            descriptor.id,
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
        );
        this.checkConsumes(descriptor);
        this.pipelineStates.set(descriptor.id, state);
        if (this.flow.lifecycle === 'preparing' || this.flow.lifecycle === 'ready') {
            state.refresh(this.lookup, this.onReplaced);
        }
        this.dirty = true;
        return state;
    }

    private releasePipeline(id: string): void {
        const state = this.pipelineStates.get(id);
        if (state === undefined) return;
        state.release();
        this.pipelineStates.delete(id);
    }

    /** Todo nome de `consumes` precisa de resolver (FR-012). */
    private checkConsumes(descriptor: PipelineDescriptor): void {
        for (const name of descriptor.consumes.map(consumesName)) {
            if (this.host.consumers.has(name)) continue;
            throw new FlowBindingError(
                `Flow '${this.flow.type}', pipeline '${descriptor.id}': consumes '${name}' sem resolver (disponíveis: ${this.host.consumers.names().join(', ') || 'nenhum'}).`,
                { flow: this.flow.type, pipeline: descriptor.id, consumes: name },
            );
        }
    }

    /** Fonte de um binding: privado pelo nome → tipo em `consumes` → erro. */
    private readonly lookup = (
        entry: InferredEntry,
        group: number,
        state: PipelineState,
    ): ResolvedSource | undefined => {
        // Privado do pipeline (`pipeline:variável`) vence o privado do Flow (`variável`).
        const priv =
            this.privates.get(`${state.id}:${entry.name}`) ?? this.privates.get(entry.name);
        if (priv !== undefined) return normalizeSource(priv);
        const consumes = state.descriptor.consumes;
        // O tipo lido pelo shader: o `as` da entrada, ou o struct que o resolver preenche.
        const candidates = consumes
            .filter(
                (c) =>
                    (typeof c === 'string' ? this.host.consumers.get(c)?.typeName : c.as)
                    === entry.typeName,
            )
            .map(consumesName);
        const names = consumes.map(consumesName);
        const where = `binding '${entry.name}' (@group(${group}) @binding(${entry.binding}), tipo '${entry.typeName}') do pipeline '${state.id}' do Flow '${this.flow.type}'`;
        const details = {
            flow: this.flow.type,
            pipeline: state.id,
            group,
            binding: entry.binding,
            variable: entry.name,
        };
        if (candidates.length === 0) {
            throw new FlowBindingError(
                `${where} sem fonte: nenhum binding privado '${entry.name}' e nenhum nome de consumes [${names.join(', ')}] com esse tipo.`,
                details,
            );
        }
        if (candidates.length > 1) {
            throw new FlowBindingError(
                `${where}: consumes ambíguo — ${candidates.join(' e ')} fornecem o tipo '${entry.typeName}'.`,
                { ...details, consumes: candidates[0]! },
            );
        }
        return this.host.consumers.resolve(candidates[0]!, {
            world: this.host.world,
            resources: this.host.resources,
        });
    };

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

    private isRequired(decl: SlotDeclaration): boolean {
        switch (decl.kind) {
            case 'pool':
            case 'singleton':
            case 'texture':
                return !decl.optional;
            case 'bodies':
            case 'target':
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
            case 'target':
                return this.targetOf(decl.color, decl.depth, decl.samples);
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
