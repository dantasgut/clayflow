import type { EngineCore, BindGroupSpec } from '../../../core/contracts/index';
import type { ResolvedSource } from '../../consumers/ConsumerResolver';
import type { ConsumerResolverRegistry } from '../../consumers/ConsumerResolverRegistry';
import type { Resource } from '../../contracts/Resource';
import type { PipelineDescriptor } from '../../descriptors/PipelineDescriptor';
import type { Schema } from '../../descriptors/Schema';
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
    ResourceType,
    SlotDeclaration,
    TextureRef,
} from '../../flows/slots';
import type { World } from '../../world/World';
import type { EntityId } from '../../world/EntityId';
import type { LayoutInferencer, InferredEntry } from '../LayoutInferencer';
import type { ResourceSystem } from '../ResourceSystem';
import { PipelineState } from './PipelineState';
import { normalizeSource } from './sources';

/** O que o runtime de um Flow usa da cena. */
export interface FlowRuntimeHost {
    readonly core: EngineCore;
    readonly world: World;
    readonly resources: ResourceSystem;
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
    private readonly entitySets = new Map<string, Map<EntityId, EntityEntry>>();
    private readonly poolViews = new Map<string, BoundPool>();
    private readonly entityViews = new Map<string, BoundEntities>();
    /** Lista das entradas por slot, refeita só quando o conjunto muda. */
    private readonly entityCaches = new Map<string, readonly EntityEntry[]>();
    private readonly compiledQueue: string[] = [];
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
            const set = new Map<EntityId, EntityEntry>();
            this.entitySets.set(name, set);
            for (const record of host.world.allRecords()) {
                const entry = this.entryFor(record.id, decl);
                if (entry !== undefined) set.set(record.id, entry);
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
        }
        for (const state of [...this.pipelineStates.values()]) {
            state.refresh(this.lookup, this.onReplaced);
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

    /** Entidades inseridas: atualiza os slots `entities` e entrega `entitiesChanged`. */
    entitiesInserted(ids: readonly EntityId[]): void {
        for (const [name, set] of this.entitySets) {
            const decl = this.flow.slots[name] as EntitiesSlot;
            const added: EntityId[] = [];
            for (const id of ids) {
                const entry = this.entryFor(id, decl);
                if (entry === undefined) continue;
                set.set(id, entry);
                added.push(id);
            }
            if (added.length > 0) this.entityCaches.delete(name);
            if (added.length > 0)
                this.deliverDomain({ type: 'entitiesChanged', slot: name, added, removed: [] });
        }
    }

    /** Entidades removidas: atualiza os slots `entities` e entrega `entitiesChanged`. */
    entitiesRemoved(ids: readonly EntityId[]): void {
        for (const [name, set] of this.entitySets) {
            const removed = ids.filter((id) => set.delete(id));
            if (removed.length > 0) this.entityCaches.delete(name);
            if (removed.length > 0)
                this.deliverDomain({ type: 'entitiesChanged', slot: name, added: [], removed });
        }
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
        for (const name of descriptor.consumes) {
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
        const priv = this.privates.get(entry.name);
        if (priv !== undefined) return normalizeSource(priv);
        const consumes = state.descriptor.consumes;
        const candidates = consumes.filter(
            (n) => this.host.consumers.get(n)?.typeName === entry.typeName,
        );
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
                `${where} sem fonte: nenhum binding privado '${entry.name}' e nenhum nome de consumes [${consumes.join(', ')}] com esse tipo.`,
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
        for (const [name, decl] of Object.entries(this.flow.slots)) {
            const value = this.resolveSlot(name, decl);
            this.slotValues[name] = value;
            if (value === undefined && this.isRequired(decl)) missing ??= name;
        }
        return missing;
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
                return this.targetOf(decl.color, decl.depth);
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
                slotOf: (id) => resources.poolSlotOf(poolKey, id),
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
            view = {
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
        color: 'canvas' | TextureRef,
        depthRef: TextureRef | undefined,
    ): BoundTarget | undefined {
        let depth: BoundTexture | undefined;
        if (depthRef !== undefined) {
            depth = this.textureOf(depthRef);
            if (depth === undefined) return undefined;
        }
        const depthPart =
            depth !== undefined ? { depth: depth.view, depthFormat: depth.texture.format } : {};
        if (color === 'canvas')
            return { color: 'canvas', format: this.host.core.canvasFormat, ...depthPart };
        const tex = this.textureOf(color);
        return tex === undefined
            ? undefined
            : { color: tex.view, format: tex.texture.format, ...depthPart };
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
                if (!descs.some((d) => d.schema === schema)) continue;
                if (descId !== undefined && !descs.some((d) => d.id === descId)) continue;
                if (select === undefined || select(r)) return r;
            }
        }
        return undefined;
    }

    private entryFor(id: EntityId, decl: EntitiesSlot): EntityEntry | undefined {
        const resources = this.host.world.resourcesOf(id);
        const found: Resource[] = [];
        for (const type of decl.all) {
            const r = resources.find((x) => x instanceof type);
            if (r === undefined) return undefined;
            found.push(r);
        }
        const all = decl.all;
        return {
            entityId: id,
            resources,
            get<T extends Resource>(type: ResourceType<T>): T {
                const index = all.indexOf(type);
                const r = index >= 0 ? found[index] : resources.find((x) => x instanceof type);
                if (r === undefined)
                    throw new Error(`EntityEntry: a entidade ${id} não tem o tipo pedido.`);
                return r as T;
            },
        };
    }
}
