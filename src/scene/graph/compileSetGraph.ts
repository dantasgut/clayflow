import type { ExtensionParamType, ExtensionParamValue } from '../contracts/ExtensionParams';
import { FieldType } from '../descriptors/FieldType';
import { StructSchema } from '../descriptors/StructSchema';
import { POINT_PARAMS } from '../shaders/WgslPoint';
import { wgslModule, type WgslModule } from '../shaders/WgslModule';
import { wgslResource, type WgslResource } from '../shaders/WgslResource';
import type { NodeGraph } from './NodeGraph';
import { NodeGraphError } from './NodeGraphError';
import type { SetNodeDefinition, SetPointInput, SetType } from './SetNode';

/** Um conjunto do plano: o schema do elemento, a capacidade, o registro `SetCount` e a origem da contagem. */
export interface PlannedSet {
    /** `nó.porta.conjunto` de quem o produz. */
    readonly key: string;
    readonly schema: StructSchema;
    readonly capacity: number;
    readonly slot: number;
    readonly count: 'cpu' | 'gpu' | 'same';
}

/** Grafo de ponto fundido numa entrada de ponto: o módulo que implementa `at`, o uniform dos parâmetros e os nomes. */
export interface FusedPointPlan {
    readonly graph: NodeGraph;
    readonly module: WgslModule;
    readonly resource: WgslResource;
    readonly schema: StructSchema;
    /** Nomes dos valores no `SetGraph` (`nó_parâmetro`), na ordem dos campos do struct. */
    readonly params: readonly string[];
}

/** Um nó de conjunto do plano: os conjuntos ligados às entradas, os de saída e os grafos de ponto fundidos. */
export interface PlannedNode {
    readonly id: string;
    readonly definition: SetNodeDefinition;
    readonly inputs: ReadonlyMap<string, PlannedSet>;
    readonly outputs: ReadonlyMap<string, PlannedSet>;
    readonly points: ReadonlyMap<string, FusedPointPlan>;
}

/** Plano de execução de um grafo de conjunto. */
export interface SetGraphPlan {
    /** Nós em ordem topológica. */
    readonly nodes: readonly PlannedNode[];
    /** Conjuntos a alocar (as saídas dos nós), na ordem dos nós. */
    readonly sets: readonly PlannedSet[];
    /** Registros `SetCount`. */
    readonly slots: number;
    /** Contagens conhecidas na CPU, por registro. */
    readonly cpuCounts: ReadonlyMap<number, number>;
    /** Algum nó depende do tempo. */
    readonly animated: boolean;
}

const isPointInput = (t: SetType | SetPointInput): t is SetPointInput => 'kind' in t;

/** Módulos de grafos de ponto fundidos, por alvo e código (o mesmo grafo em vários grafos de conjunto: um módulo). */
const fused = new Map<string, Omit<FusedPointPlan, 'graph' | 'params'>>();

/** FNV-1a de 32 bits em hexadecimal. */
function fnv(text: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
}

/**
 * Compila o grafo de ponto ligado à entrada de ponto `input` (spec 031, FR-018): a função do alvo (um `let` por nó), o
 * struct dos parâmetros (uniform, um campo por `nó_parâmetro`) e a função `at` que o kernel chama — a do alvo com os
 * parâmetros do uniform. Memorizado por alvo e código.
 */
function fusePoint(graph: NodeGraph, input: SetPointInput): FusedPointPlan {
    const target = input.target;
    const code = graph.compile(target);
    const params = graph.params();
    const key = `${target.name}|${input.fn}|${JSON.stringify(params)}|${code}`;
    let entry = fused.get(key);
    if (entry === undefined) {
        const hash = fnv(key);
        const fields: Record<string, FieldType> = {};
        for (const [name, type] of Object.entries(params)) fields[name] = fieldOf(type);
        if (Object.keys(fields).length === 0) fields._unused = FieldType.u32;
        const schema = new StructSchema(`${target.paramsAlias}_${hash}`, fields, {
            addressSpace: 'uniform',
        });
        const resource = wgslResource({
            name: `${input.fn}_params`,
            binding: { uniform: true },
            type: { schema },
            frequency: 'stage',
            provider: 'private',
        });
        const sig = target.required;
        const names =
            sig.names ?? sig.params.map((t, k) => (t === POINT_PARAMS ? 'data' : `a${k}`));
        const args = sig.params
            .map((t, k) => (t === POINT_PARAMS ? undefined : `${names[k]}: ${t}`))
            .filter((a): a is string => a !== undefined);
        const call = sig.params.map((t, k) =>
            t === POINT_PARAMS ? `${input.fn}_params` : names[k]!,
        );
        const source = [
            `// Grafo de ponto fundido na entrada '${input.fn}' (spec 031, FR-018).`,
            `alias ${target.paramsAlias} = ${schema.name};`,
            code,
            `fn ${input.fn}(${args.join(', ')}) -> ${sig.returns} {`,
            `    return ${sig.name}(${call.join(', ')});`,
            '}',
        ].join('\n');
        const module = wgslModule({
            name: `${input.fn}_graph_${hash}`,
            source,
            requires: [...input.at.ready.requires, ...graph.modules(), resource],
        });
        entry = { module, resource, schema };
        fused.set(key, entry);
    }
    return { ...entry, graph, params: Object.keys(params) };
}

function fieldOf(type: ExtensionParamType): FieldType {
    return (FieldType as unknown as Record<string, FieldType>)[type]!;
}

/**
 * Plano de um grafo de conjunto (spec 031, R10): nós em ordem topológica; para cada saída, a capacidade pela regra do
 * nó (valores atuais e capacidades das entradas) e o registro `SetCount` — próprio, ou o da entrada que a regra `same`
 * nomeia; as contagens da CPU; e os grafos de ponto das entradas de ponto, compilados e fundidos.
 *
 * @param valuesOf Valores atuais do nó (pelo nome do parâmetro).
 * @throws NodeGraphError capacidade inválida ou ausente, grafo de ponto que não compila contra o alvo da entrada.
 */
export function compileSetGraph(
    graph: NodeGraph,
    valuesOf: (id: string) => Readonly<Record<string, ExtensionParamValue>>,
): SetGraphPlan {
    const produced = new Map<string, PlannedSet>();
    const nodes: PlannedNode[] = [];
    const sets: PlannedSet[] = [];
    const cpuCounts = new Map<number, number>();
    let slots = 0;
    let animated = false;
    for (const id of graph.setOrder()) {
        const def = graph.node(id).set!;
        animated ||= def.animated;
        const inputs = new Map<string, PlannedSet>();
        const points = new Map<string, FusedPointPlan>();
        for (const [port, type] of Object.entries(def.inputs)) {
            if (isPointInput(type)) {
                const sub = graph.pointGraphFor(`${id}.${port}`);
                if (sub !== undefined) points.set(port, fusePoint(sub, type));
                continue;
            }
            const src = graph.sourceOf(`${id}.${port}`)!;
            for (const set of Object.keys(type.sets))
                inputs.set(`${port}.${set}`, produced.get(`${src}.${set}`)!);
        }
        const values = valuesOf(id);
        const capacities = def.capacity({
            values,
            input: (port, set) => {
                const s = inputs.get(`${port}.${set}`);
                if (s === undefined)
                    throw new NodeGraphError(
                        'target',
                        `${def.name}: '${port}.${set}' não é conjunto de entrada`,
                        [id],
                    );
                return s.capacity;
            },
        });
        const outputs = new Map<string, PlannedSet>();
        for (const [port, type] of Object.entries(def.outputs)) {
            for (const [set, schema] of Object.entries(type.sets)) {
                const local = `${port}.${set}`;
                const capacity = capacities[local];
                if (capacity === undefined || !Number.isInteger(capacity) || capacity < 1) {
                    throw new NodeGraphError(
                        'target',
                        `SetGraph: capacidade de '${id}.${local}' (${def.name}) inválida: ${String(capacity)}`,
                        [id, local],
                    );
                }
                const rule = def.counts[local] ?? 'cpu';
                const same = typeof rule === 'object' ? inputs.get(rule.same)! : undefined;
                const planned: PlannedSet = {
                    key: `${id}.${local}`,
                    schema,
                    capacity,
                    slot: same?.slot ?? slots++,
                    count: same !== undefined ? 'same' : (rule as 'cpu' | 'gpu'),
                };
                if (planned.count === 'cpu') cpuCounts.set(planned.slot, capacity);
                outputs.set(local, planned);
                produced.set(`${id}.${local}`, planned);
                sets.push(planned);
            }
        }
        nodes.push({ id, definition: def, inputs, outputs, points });
    }
    return { nodes, sets, slots: Math.max(1, slots), cpuCounts, animated };
}
