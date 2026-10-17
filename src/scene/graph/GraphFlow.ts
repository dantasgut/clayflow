import type {
    EngineCore,
    Frame,
    IndirectBufferSpec,
    StorageBufferSpec,
    UniformBufferSpec,
} from '../contracts/gpu';
import type { Resource } from '../contracts/Resource';
import type { ResourceDirectory } from '../contracts/ResourceDirectory';
import { Flow } from '../flows/Flow';
import type { BoundFlow, TransitionContext } from '../flows/FlowBinding';
import type { FlowContext } from '../flows/FlowRegistry';
import type { FlowTransitions } from '../flows/FlowTransitions';
import { slot, type EntitiesSlot, type ResourceType, type SlotMap } from '../flows/slots';
import type { EntityId } from '../world/EntityId';
import { compileSetGraph, type PlannedSet, type SetGraphPlan } from './compileSetGraph';
import { SetCountSchema, SET_COUNT_DISPATCH_OFFSET } from './SetCountSchema';
import { SetGraph } from './SetGraph';
import type { SetBuffer, SetNodeContext, SetNodeInstance } from './SetNode';

/** Opções de `GraphFlow`. */
export interface GraphFlowOptions {
    /**
     * Tipo do Resource alvo na entidade (ex.: a `GraphGeometry` que o nó de saída escreve) e os descritores dele que o
     * grafo escreve (posse da GPU).
     */
    readonly target?: ResourceType;
    readonly owns?: readonly string[];
}

/** Slots do `GraphFlow`. */
export interface GraphFlowSlots extends SlotMap {
    /** Entidades com grafo de conjunto. */
    readonly graphs: EntitiesSlot;
}

type Ctx = TransitionContext<GraphFlowSlots>;
type State = 'idle';

/** Um grafo na cena: o plano, os conjuntos, os registros de contagem, as instâncias e a memória do resultado. */
interface Running {
    readonly entity: EntityId;
    readonly graph: SetGraph;
    readonly target: Resource | undefined;
    revision: number;
    plan: SetGraphPlan;
    counts: IndirectBufferSpec;
    sets: Map<string, StorageBufferSpec>;
    /** Uniforms dos grafos de ponto fundidos, por `nó.porta`. */
    points: Map<string, UniformBufferSpec>;
    instances: SetNodeInstance[];
    /** Precisa ser refeito. */
    stale: boolean;
    /** Gravado neste quadro (fica limpo quando o quadro é enviado). */
    recorded: boolean;
}

/**
 * Grafo de nós de conjunto compilado num Flow (spec 031, R10, FR-017–FR-020): para cada entidade com `SetGraph`, o
 * plano (`compileSetGraph`), os conjuntos intermediários e os registros `SetCount` (alocados aqui, na C2), as
 * contagens conhecidas na CPU já com os argumentos de despacho e de desenho, os uniforms dos grafos de ponto fundidos e
 * a instância de cada nó. `dispatch` grava os nós em ordem topológica **só quando o grafo está desatualizado** — ao
 * entrar, com valores novos (`poolWritten` do registro do `SetGraph`), com topologia nova (revisão) ou, com nó
 * dependente do tempo, a cada quadro; `frameRecorded` o deixa limpo (FR-020: nada refeito com a cena parada). Nada é
 * lido de volta: contagens decididas na GPU seguem por despacho e desenho indiretos (FR-019).
 */
export class GraphFlow extends Flow<GraphFlowSlots, State> {
    readonly type = 'GraphFlow';
    readonly slots: GraphFlowSlots;
    override readonly listens = [SetGraph.schema];
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<State, Ctx>;

    private readonly core: EngineCore;
    private readonly resources: ResourceDirectory;
    private readonly target: ResourceType | undefined;
    private readonly running = new Map<EntityId, Running>();

    constructor(ctx: FlowContext, options: GraphFlowOptions = {}) {
        super();
        this.core = ctx.core;
        this.resources = ctx.resources;
        this.target = options.target;
        this.slots = {
            graphs: slot.entities({
                all: [SetGraph],
                ...(options.target !== undefined && options.owns !== undefined
                    ? { owns: options.owns.map((d) => [options.target!, d] as const) }
                    : {}),
            }),
        };
        this.transitions = {
            '*': {
                slotsResolved: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.track(
                            c.bound.slots.graphs.entries.map((e) => e.entityId),
                            [],
                            c,
                        );
                    },
                },
                entitiesChanged: {
                    to: 'idle',
                    run: (e, c) => {
                        if (e.type === 'entitiesChanged') this.track(e.added, e.removed, c);
                    },
                },
                poolWritten: {
                    to: 'idle',
                    run: () => {
                        this.refresh();
                    },
                },
                resourceReady: 'ignore',
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        for (const r of this.running.values()) {
                            if (r.plan.animated) r.stale = true;
                            // Quem lê a geometria escrita (a estrutura de raios, spec 033) a refaz nos quadros em que
                            // o grafo a escreve.
                            if (
                                r.target?.getDescriptors().some((d) => d.id === 'vertices') === true
                            )
                                c.produced(r.target, 'vertices', r.stale);
                        }
                    },
                },
                frameRecorded: {
                    to: 'idle',
                    run: () => {
                        for (const r of this.running.values()) {
                            if (!r.recorded) continue;
                            r.recorded = false;
                            r.stale = r.plan.animated;
                        }
                    },
                },
                // Sem entidades o slot some (o Flow volta a esperar): libera tudo; `slotsResolved` refaz.
                slotLost: {
                    to: 'idle',
                    run: () => {
                        for (const r of this.running.values()) this.release(r);
                        this.running.clear();
                    },
                },
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                poolReallocated: 'ignore',
            },
        };
    }

    /** Grafos desatualizados: grava os nós em ordem topológica. */
    dispatch(frame: Frame, _bound: BoundFlow<GraphFlowSlots>): void {
        for (const r of this.running.values()) {
            if (!r.stale) continue;
            for (const instance of r.instances) instance.record(frame);
            r.recorded = true;
        }
    }

    /** Grafo da entidade `id` está desatualizado (para testes e depuração). */
    isStale(id: EntityId): boolean | undefined {
        return this.running.get(id)?.stale;
    }

    override dispose(): void {
        for (const r of this.running.values()) this.release(r);
        this.running.clear();
    }

    private track(added: readonly EntityId[], removed: readonly EntityId[], ctx: Ctx): void {
        for (const id of removed) {
            const r = this.running.get(id);
            if (r === undefined) continue;
            this.release(r);
            this.running.delete(id);
        }
        for (const id of added) {
            const entry = ctx.bound.slots.graphs.entry(id);
            if (entry === undefined || this.running.has(id)) continue;
            const graph = entry.get(SetGraph);
            const target =
                this.target === undefined
                    ? undefined
                    : entry.resources.find((r) => r instanceof this.target!);
            this.running.set(id, this.build(id, graph, target));
        }
    }

    /** Valores ou topologia mudaram: recria o que mudou e marca para refazer. */
    private refresh(): void {
        for (const [id, r] of this.running) {
            if (r.graph.revision !== r.revision) {
                this.release(r);
                this.running.set(id, this.build(id, r.graph, r.target));
                continue;
            }
            const plan = compileSetGraph(r.graph.graph, (n) => r.graph.valuesOf(n));
            if (!samePlan(plan, r.plan)) {
                this.release(r);
                this.running.set(id, this.build(id, r.graph, r.target));
                continue;
            }
            this.writeInputs(r);
            for (const instance of r.instances) instance.update();
            r.stale = true;
        }
    }

    private build(id: EntityId, graph: SetGraph, target: Resource | undefined): Running {
        const plan = compileSetGraph(graph.graph, (n) => graph.valuesOf(n));
        const disc = `graph:${id}:${graph.revision}`;
        const counts = this.core.create<IndirectBufferSpec>({
            kind: 'buffer',
            subkind: 'indirect',
            discriminator: `${disc}:counts`,
            byteSize: plan.slots * SetCountSchema.stride,
        });
        const sets = new Map<string, StorageBufferSpec>();
        for (const s of plan.sets) {
            sets.set(
                s.key,
                this.core.create<StorageBufferSpec>({
                    kind: 'buffer',
                    subkind: 'storage',
                    discriminator: `${disc}:${s.key}`,
                    byteSize: Math.max(16, s.capacity * s.schema.stride),
                }),
            );
        }
        const points = new Map<string, UniformBufferSpec>();
        for (const node of plan.nodes)
            for (const [port, p] of node.points) {
                points.set(
                    `${node.id}.${port}`,
                    this.core.create<UniformBufferSpec>({
                        kind: 'buffer',
                        subkind: 'uniform',
                        discriminator: `${disc}:${node.id}.${port}:params`,
                        byteSize: p.schema.stride,
                    }),
                );
            }
        const r: Running = {
            entity: id,
            graph,
            target,
            revision: graph.revision,
            plan,
            counts,
            sets,
            points,
            instances: [],
            stale: true,
            recorded: false,
        };
        this.writeInputs(r);
        r.instances = plan.nodes.map((node) =>
            node.definition.create(this.nodeContext(r, node.id, disc)),
        );
        for (const instance of r.instances) instance.update();
        return r;
    }

    /** Contexto de um nó: conjuntos, contagens, grafos de ponto fundidos, valores e o alvo. */
    private nodeContext(r: Running, nodeId: string, disc: string): SetNodeContext {
        const node = r.plan.nodes.find((n) => n.id === nodeId)!;
        const setBuffer = (s: PlannedSet | undefined, what: string): SetBuffer => {
            if (s === undefined)
                throw new Error(`GraphFlow: '${nodeId}' não tem o conjunto ${what}.`);
            return { buffer: r.sets.get(s.key)!, capacity: s.capacity, slot: s.slot };
        };
        return {
            core: this.core,
            id: `${disc}:${nodeId}`,
            counts: r.counts,
            input: (port, set) =>
                setBuffer(node.inputs.get(`${port}.${set}`), `de entrada '${port}.${set}'`),
            output: (port, set) =>
                setBuffer(node.outputs.get(`${port}.${set}`), `de saída '${port}.${set}'`),
            point: (port) => {
                const p = node.points.get(port);
                if (p === undefined) return undefined;
                return {
                    module: p.module,
                    resource: p.resource,
                    params: r.points.get(`${nodeId}.${port}`)!,
                };
            },
            values: () => r.graph.valuesOf(nodeId),
            target: (descId) => {
                if (r.target === undefined) return undefined;
                const b = this.resources.bufferOf(r.target, descId);
                return b === undefined || b.subkind === 'staging' ? undefined : b;
            },
        };
    }

    /** Contagens da CPU (com despacho e desenho) e uniforms dos grafos de ponto fundidos. */
    private writeInputs(r: Running): void {
        const limit = this.core.capabilities().limits.maxComputeWorkgroupsPerDimension ?? 65_535;
        for (const [slotIndex, count] of r.plan.cpuCounts) {
            const groups = Math.ceil(count / SET_GROUP);
            const x = Math.min(groups, limit);
            const record = SetCountSchema.pack({
                count,
                dispatch_x: x,
                dispatch_y: x === 0 ? 1 : Math.ceil(groups / x),
                dispatch_z: 1,
                index_count: count,
                instance_count: 1,
            });
            this.core.write(r.counts, record, slotIndex * SetCountSchema.stride);
        }
        for (const node of r.plan.nodes) {
            const values = r.graph.values;
            for (const [port, p] of node.points) {
                const data: Record<string, unknown> = {};
                for (const name of p.params) data[name] = values[name];
                this.core.write(r.points.get(`${node.id}.${port}`)!, p.schema.pack(data));
            }
        }
    }

    private release(r: Running): void {
        for (const instance of r.instances) instance.dispose();
        for (const b of r.sets.values()) this.core.destroy(b);
        for (const b of r.points.values()) this.core.destroy(b);
        this.core.destroy(r.counts);
    }
}

/** Invocações por grupo dos despachos de conjunto (os argumentos indiretos de `SetCount`). */
export const SET_GROUP = 256;

/** Byte dos argumentos de despacho do registro `slot`. */
export function setDispatchOffset(slot: number): number {
    return slot * SetCountSchema.stride + SET_COUNT_DISPATCH_OFFSET;
}

/** Mesmos conjuntos com as mesmas capacidades e registros (os buffers e as instâncias servem). */
function samePlan(a: SetGraphPlan, b: SetGraphPlan): boolean {
    if (a.sets.length !== b.sets.length || a.slots !== b.slots) return false;
    return a.sets.every((s, k) => {
        const o = b.sets[k]!;
        return (
            s.key === o.key && s.capacity === o.capacity && s.slot === o.slot && s.count === o.count
        );
    });
}
