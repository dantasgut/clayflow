import type { ExtensionParamType, ExtensionParamValue } from '../contracts/ExtensionParams';
import type { WgslModule } from '../shaders/WgslModule';
import { POINT_PARAMS } from '../shaders/WgslPoint';
import type { NodeDefinition, NodeUse, PortType } from './NodeDefinition';
import { NodeGraphError } from './NodeGraphError';
import type { PointTarget, SetNodeDefinition, SetNodeUse, SetPointInput, SetType } from './SetNode';

/**
 * Argumento da função do ponto alvo lido pelo grafo (ex.: a amostra de superfície `s` do ponto `material`). Saídas:
 * `value` (o argumento inteiro) e um campo por entrada de `fields` (`s.world_position`…).
 */
export interface GraphArgument {
    readonly kind: 'argument';
    /** Nome do argumento na assinatura do ponto (`WgslPointSignature.names`). */
    readonly name: string;
    /** Campos do struct do argumento expostos como saídas: nome → tipo. */
    readonly fields: Readonly<Record<string, PortType>>;
}

/**
 * Sub-grafo de conjunto (spec 031, R9/US4): expandido no grafo que o usa (nós de dentro com o prefixo do uso), para
 * que conjuntos e contagens circulem entre dentro e fora sem cópia. Os parâmetros expostos (`nó_parâmetro`) recebem o
 * valor do uso; os outros, o do sub-grafo.
 */
export interface SetSubgraph {
    readonly level: 'subgraph';
    readonly name: string;
    readonly graph: NodeGraph;
    readonly inputs: Readonly<Record<string, string>>;
    readonly outputs: Readonly<Record<string, string>>;
    /** Parâmetros expostos como declarados (`nó.parâmetro`). */
    readonly expose: readonly string[];
    /** Parâmetros expostos: `nó_parâmetro` → tipo e valor do sub-grafo. */
    readonly params: Readonly<
        Record<string, { readonly type: ExtensionParamType; readonly default: ExtensionParamValue }>
    >;
    with(values: Readonly<Record<string, ExtensionParamValue>>): SetSubgraphUse;
}

/** Um sub-grafo de conjunto no grafo: a definição e os valores dos parâmetros expostos. */
export interface SetSubgraphUse {
    readonly definition: SetSubgraph;
    readonly values: Readonly<Record<string, ExtensionParamValue>>;
}

/**
 * Nó do grafo: uso de uma definição de ponto ou de conjunto (com valores), a definição (valores padrão) ou um argumento
 * do ponto.
 */
export type GraphNode =
    | NodeUse
    | NodeDefinition
    | SetNodeUse
    | SetNodeDefinition
    | SetSubgraph
    | SetSubgraphUse
    | GraphArgument;

/** Nó já expandido: sem sub-grafos de conjunto. */
export type FlatNode = Exclude<GraphNode, SetSubgraph | SetSubgraphUse>;

/** Uma ligação: `['origem.porta', 'destino.porta']`. */
export type GraphLink = readonly [string, string];

/** Opções de `NodeGraph`. */
export interface NodeGraphOptions {
    /** Nós por id (identificador WGSL). */
    readonly nodes: Readonly<Record<string, GraphNode>>;
    /** Ligações saída → entrada. Uma entrada recebe no máximo uma; uma saída alimenta quantas quiser. */
    readonly links: readonly GraphLink[];
    /**
     * A porta cujo valor a função do grafo devolve (`'nó.porta'`). Sem saída (grafo vazio ou em montagem), a função
     * usa a implementação pronta do ponto.
     */
    readonly output?: string;
    /**
     * Entradas de conjunto deixadas abertas (`nó.porta`): a fronteira de um sub-grafo de conjunto, ligada por quem o usa.
     */
    readonly open?: readonly string[];
}

/** O argumento `name` do ponto alvo, como nó do grafo: saída `value` e uma por campo de `fields`. */
export function graphArgument(
    name: string,
    fields: Readonly<Record<string, PortType>> = {},
): GraphArgument {
    return Object.freeze({ kind: 'argument' as const, name, fields: Object.freeze({ ...fields }) });
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const norm = (t: string): string => t.replace(/\s+/g, '');

/** Um nó resolvido: id, definição de ponto, de conjunto ou argumento, e valores. */
export interface ResolvedNode {
    readonly id: string;
    readonly definition: NodeDefinition | undefined;
    readonly set: SetNodeDefinition | undefined;
    readonly argument: GraphArgument | undefined;
    readonly values: Readonly<Record<string, ExtensionParamValue>>;
}

/** Portas de entrada de um nó resolvido (de ponto ou de conjunto). */
function inputsOf(node: ResolvedNode): readonly string[] {
    return Object.keys(node.definition?.inputs ?? node.set?.inputs ?? {});
}

const isPointInput = (t: SetType | SetPointInput): t is SetPointInput => 'kind' in t;

/** Conversões implícitas declaradas: escalar → vetor do mesmo tipo de componente (repetido). */
const SPLAT: Readonly<Record<string, string>> = {
    'f32>vec2f': 'vec2f',
    'f32>vec3f': 'vec3f',
    'f32>vec4f': 'vec4f',
    'u32>vec2u': 'vec2u',
    'u32>vec3u': 'vec3u',
    'u32>vec4u': 'vec4u',
    'i32>vec2i': 'vec2i',
    'i32>vec3i': 'vec3i',
    'i32>vec4i': 'vec4i',
};

/**
 * Grafo de nós (spec 031): nós ligados por portas tipadas. Imutável; validado na criação — nós e portas existentes,
 * uma ligação por entrada, toda entrada ligada ou com padrão, conjuntos ligados a conjuntos do mesmo tipo, sem ciclos
 * (com o caminho). De ponto (US2): avaliado por amostra, compilado para um ponto alvo (`compile`, que confere tipos e
 * estágios). De conjunto (US3): nós de conjunto em ordem (`setOrder`), com os grafos de ponto das entradas de ponto
 * (`pointGraphFor`) fundidos nos kernels — o `SetGraph` o executa. A identidade é a forma: definições, ligações e
 * saída; os valores dos parâmetros não entram (mudar um valor não recompila).
 */
export class NodeGraph {
    readonly nodes: Readonly<Record<string, GraphNode>>;
    readonly links: readonly GraphLink[];
    readonly output: string | undefined;
    /** Entradas de conjunto abertas (fronteira de sub-grafo). */
    readonly open: readonly string[];
    readonly #resolved = new Map<string, ResolvedNode>();
    /** Entrada (`nó.porta`) → origem (`nó.porta`). */
    readonly #sources = new Map<string, string>();

    /** Nós com os sub-grafos de conjunto expandidos (`uso_nó`). */
    readonly flatNodes: Readonly<Record<string, FlatNode>>;
    /** Ligações com os sub-grafos de conjunto expandidos. */
    readonly flatLinks: readonly GraphLink[];

    constructor(options: NodeGraphOptions) {
        this.nodes = Object.freeze({ ...options.nodes });
        this.links = Object.freeze(options.links.map((l) => Object.freeze([...l] as const)));
        this.output = options.output;
        this.open = Object.freeze([...(options.open ?? [])]);
        for (const id of Object.keys(this.nodes)) {
            if (!IDENT.test(id))
                throw new NodeGraphError(
                    'unknown-node',
                    `NodeGraph: id '${id}' não é identificador WGSL`,
                    [id],
                );
        }
        const flat = expand(this.nodes, this.links);
        this.flatNodes = Object.freeze(flat.nodes);
        this.flatLinks = Object.freeze(flat.links);
        for (const [id, node] of Object.entries(this.flatNodes))
            this.#resolved.set(id, resolve(id, node));
        for (const [from, to] of this.flatLinks) {
            this.#port(from, 'out');
            this.#port(to, 'in');
            if (this.#sources.has(to)) {
                throw new NodeGraphError(
                    'duplicate-link',
                    `NodeGraph: a entrada '${to}' recebe duas ligações ('${this.#sources.get(to)}' e '${from}')`,
                    [to, this.#sources.get(to)!, from],
                );
            }
            this.#sources.set(to, from);
        }
        if (this.output !== undefined) this.#port(this.output, 'out');
        for (const [from, to] of this.flatLinks) this.#checkLevels(from, to);
        for (const node of this.#resolved.values()) {
            if (node.set !== undefined) {
                for (const [input, type] of Object.entries(node.set.inputs)) {
                    const key = `${node.id}.${input}`;
                    if (isPointInput(type) || this.#sources.has(key) || this.open.includes(key))
                        continue;
                    throw new NodeGraphError(
                        'unconnected-input',
                        `NodeGraph: a entrada de conjunto '${node.id}.${input}' (${node.set.name}) não tem ligação`,
                        [node.id, input],
                    );
                }
            }
            if (node.definition === undefined) continue;
            for (const input of Object.keys(node.definition.inputs)) {
                const key = `${node.id}.${input}`;
                if (this.#sources.has(key) || input in node.definition.defaults) continue;
                throw new NodeGraphError(
                    'unconnected-input',
                    `NodeGraph: a entrada '${key}' (${node.definition.name}) não tem ligação nem padrão`,
                    [node.id, input],
                );
            }
        }
        this.#checkCycles();
    }

    /** A origem ligada à entrada `nó.porta`, ou `undefined`. */
    sourceOf(input: string): string | undefined {
        return this.#sources.get(input);
    }

    /** Nó resolvido pelo id. */
    node(id: string): ResolvedNode {
        return this.#resolved.get(id)!;
    }

    /** Ids dos nós de que a saída depende, em ordem topológica (dependências antes). */
    order(): readonly string[] {
        const out: string[] = [];
        const done = new Set<string>();
        const visit = (id: string): void => {
            if (done.has(id)) return;
            done.add(id);
            const node = this.#resolved.get(id)!;
            for (const input of inputsOf(node)) {
                const src = this.#sources.get(`${id}.${input}`);
                if (src !== undefined) visit(src.slice(0, src.indexOf('.')));
            }
            out.push(id);
        };
        if (this.output !== undefined) visit(this.output.slice(0, this.output.indexOf('.')));
        return out;
    }

    /** Ids dos nós de conjunto em ordem topológica (dependências antes; empates pela ordem de declaração). */
    setOrder(): readonly string[] {
        const out: string[] = [];
        const done = new Set<string>();
        const visit = (id: string): void => {
            if (done.has(id)) return;
            done.add(id);
            const node = this.#resolved.get(id)!;
            if (node.set === undefined) return;
            for (const [input, type] of Object.entries(node.set.inputs)) {
                if (isPointInput(type)) continue;
                const src = this.#sources.get(`${id}.${input}`);
                if (src !== undefined) visit(split(src)[0]);
            }
            out.push(id);
        };
        for (const [id, node] of this.#resolved) if (node.set !== undefined) visit(id);
        return out;
    }

    /**
     * O grafo de ponto ligado à entrada de ponto `nó.porta` de um nó de conjunto: os nós de ponto e argumentos de que a
     * origem depende, com a origem como saída; `undefined` sem ligação.
     */
    pointGraphFor(input: string): NodeGraph | undefined {
        const src = this.#sources.get(input);
        if (src === undefined) return undefined;
        const ids = new Set<string>();
        const visit = (id: string): void => {
            if (ids.has(id)) return;
            ids.add(id);
            for (const port of inputsOf(this.#resolved.get(id)!)) {
                const from = this.#sources.get(`${id}.${port}`);
                if (from !== undefined) visit(split(from)[0]);
            }
        };
        visit(split(src)[0]);
        return new NodeGraph({
            nodes: Object.fromEntries([...ids].map((id) => [id, this.flatNodes[id]!])),
            links: this.flatLinks.filter(([, to]) => ids.has(split(to)[0])),
            output: src,
        });
    }

    /** Parâmetros (`nó_parâmetro` → tipo) de todos os nós com definição, na ordem de declaração. */
    allParams(): Readonly<Record<string, ExtensionParamType>> {
        const out: Record<string, ExtensionParamType> = {};
        for (const [id, node] of this.#resolved) {
            for (const [name, p] of Object.entries(
                node.definition?.params ?? node.set?.params ?? {},
            ))
                out[`${id}_${name}`] = p.type;
        }
        return out;
    }

    /** Valores iniciais (o uso, ou o padrão) dos parâmetros de todos os nós com definição. */
    allValues(): Readonly<Record<string, ExtensionParamValue>> {
        const out: Record<string, ExtensionParamValue> = {};
        for (const [id, node] of this.#resolved) {
            for (const [name, p] of Object.entries(
                node.definition?.params ?? node.set?.params ?? {},
            )) {
                const v = node.values[name] ?? p.default;
                if (v !== undefined) out[`${id}_${name}`] = v;
            }
        }
        return out;
    }

    /** Parâmetros do grafo (`nó_parâmetro` → tipo) dos nós de que a saída depende, em ordem. */
    params(): Readonly<Record<string, ExtensionParamType>> {
        const out: Record<string, ExtensionParamType> = {};
        for (const id of this.order()) {
            const def = this.#resolved.get(id)!.definition;
            if (def === undefined) continue;
            for (const [name, p] of Object.entries(def.params)) out[`${id}_${name}`] = p.type;
        }
        return out;
    }

    /** Valores iniciais dos parâmetros (o uso, ou o padrão da definição). */
    values(): Readonly<Record<string, ExtensionParamValue>> {
        const out: Record<string, ExtensionParamValue> = {};
        for (const id of this.order()) {
            const node = this.#resolved.get(id)!;
            if (node.definition === undefined) continue;
            for (const [name, p] of Object.entries(node.definition.params)) {
                const v = node.values[name] ?? p.default;
                if (v !== undefined) out[`${id}_${name}`] = v;
            }
        }
        return out;
    }

    /** Módulos dos nós de que a saída depende (cada um uma vez). */
    modules(): readonly WgslModule[] {
        const out: WgslModule[] = [];
        for (const id of this.order()) {
            const code = this.#resolved.get(id)!.definition?.code;
            if (code !== undefined && !out.includes(code)) out.push(code);
        }
        return out;
    }

    /**
     * Código WGSL da função do ponto `point` a partir do grafo (spec 031, R9): um `let` por nó, em ordem topológica — cada
     * nó avaliado uma vez por amostra, mesmo com a saída usada em vários lugares —, os argumentos do ponto pelos nomes da
     * assinatura e os parâmetros pelo struct do ponto (`data.nó_parâmetro`).
     *
     * @throws NodeGraphError tipos incompatíveis, argumento inexistente, nó fora do estágio do ponto, saída de tipo
     *   diferente do retorno do ponto.
     */
    compile(point: PointTarget): string {
        const output = this.output;
        if (output === undefined) {
            throw new NodeGraphError(
                'target',
                `NodeGraph: sem saída — nada a compilar para o ponto '${point.name}' (a função usa a pronta)`,
                [point.name],
            );
        }
        const sig = point.required;
        const argTypes = new Map<string, string>();
        const names =
            sig.names
            ?? sig.params.map((_, k) => (sig.params[k] === POINT_PARAMS ? 'data' : `a${k}`));
        sig.params.forEach((t, k) => {
            if (t !== POINT_PARAMS) argTypes.set(names[k]!, norm(t));
        });
        const typeOf = (ref: string): string => {
            const [id, port] = split(ref);
            const node = this.#resolved.get(id)!;
            if (node.argument !== undefined) {
                const t = argTypes.get(node.argument.name);
                if (t === undefined) {
                    throw new NodeGraphError(
                        'target',
                        `NodeGraph: o ponto '${point.name}' não tem argumento '${node.argument.name}' (tem ${[...argTypes.keys()].join(', ')})`,
                        [id, node.argument.name],
                    );
                }
                return port === 'value' ? t : norm(node.argument.fields[port]!);
            }
            return norm(node.definition!.outputs[port]!);
        };
        const valueOf = (ref: string): string => {
            const [id, port] = split(ref);
            const node = this.#resolved.get(id)!;
            if (node.argument !== undefined)
                return port === 'value' ? node.argument.name : `${node.argument.name}.${port}`;
            return Object.keys(node.definition!.outputs).length === 1
                ? `v_${id}`
                : `v_${id}.${port}`;
        };
        const convert = (ref: string, to: string, where: string): string => {
            const from = typeOf(ref);
            const target = norm(to);
            if (from === target) return valueOf(ref);
            const splat = SPLAT[`${from}>${target}`];
            if (splat !== undefined) return `${splat}(${valueOf(ref)})`;
            throw new NodeGraphError(
                'type-mismatch',
                `NodeGraph: '${ref}' (${from}) não liga em '${where}' (${target})`,
                [ref, where],
            );
        };
        const lines: string[] = [];
        for (const id of this.order()) {
            const node = this.#resolved.get(id)!;
            if (node.set !== undefined) {
                throw new NodeGraphError(
                    'target',
                    `NodeGraph: o nó de conjunto '${id}' (${node.set.name}) não entra no grafo de ponto '${point.name}'`,
                    [id, node.set.name],
                );
            }
            const def = node.definition;
            if (def === undefined) continue;
            if (!def.contexts.includes(point.context)) {
                throw new NodeGraphError(
                    'context',
                    `NodeGraph: o nó '${id}' (${def.name}) não vale em '${point.context}' (ponto '${point.name}'; vale em ${def.contexts.join(', ')})`,
                    [id, def.name, point.context],
                );
            }
            const args = Object.entries(def.inputs).map(([input, type]) => {
                const src = this.#sources.get(`${id}.${input}`);
                return src === undefined
                    ? def.defaults[input]!
                    : convert(src, type, `${id}.${input}`);
            });
            for (const name of Object.keys(def.params)) args.push(`data.${id}_${name}`);
            lines.push(`    let v_${id} = ${def.fn}(${args.join(', ')});`);
        }
        const params = sig.params
            .map((t, k) => `${names[k]}: ${t === POINT_PARAMS ? point.paramsAlias : t}`)
            .join(', ');
        const ret = convert(output, sig.returns, `retorno de ${sig.name}`);
        return [
            `// Grafo de nós (spec 031): ${this.order().length} nós, um 'let' por nó.`,
            `fn ${sig.name}(${params}) -> ${sig.returns} {`,
            ...lines,
            `    return ${ret};`,
            '}',
        ].join('\n');
    }

    #port(ref: string, side: 'in' | 'out'): void {
        const [id, port] = split(ref);
        const node = this.#resolved.get(id);
        if (node === undefined) {
            throw new NodeGraphError(
                'unknown-node',
                `NodeGraph: nó '${id}' (em '${ref}') não existe`,
                [id],
            );
        }
        if (node.argument !== undefined) {
            if (side === 'out' && (port === 'value' || port in node.argument.fields)) return;
        } else {
            const def = node.definition ?? node.set!;
            if (side === 'out' ? port in def.outputs : port in def.inputs) return;
        }
        throw new NodeGraphError(
            'unknown-port',
            `NodeGraph: '${ref}' não é ${side === 'out' ? 'saída' : 'entrada'} do nó '${id}'`,
            [id, port],
        );
    }

    /**
     * Níveis de uma ligação: conjunto só liga em conjunto do mesmo tipo; valor de ponto só em entrada de ponto (de nó de
     * ponto ou entrada de ponto de nó de conjunto).
     */
    #checkLevels(from: string, to: string): void {
        const [fid, fport] = split(from);
        const [tid, tport] = split(to);
        const source = this.#resolved.get(fid)!;
        const dest = this.#resolved.get(tid)!;
        const fromSet = source.set?.outputs[fport];
        const toInput = dest.set?.inputs[tport];
        const mismatch = (why: string): never => {
            throw new NodeGraphError(
                'type-mismatch',
                `NodeGraph: '${from}' não liga em '${to}' (${why})`,
                [from, to],
            );
        };
        if (fromSet !== undefined) {
            if (toInput === undefined || isPointInput(toInput))
                return mismatch(`conjunto '${fromSet.name}' em entrada de ponto`);
            if (toInput.name !== fromSet.name)
                mismatch(`conjunto '${fromSet.name}' em '${toInput.name}'`);
        } else if (toInput !== undefined && !isPointInput(toInput)) {
            mismatch(`valor de ponto em conjunto '${toInput.name}'`);
        }
    }

    #checkCycles(): void {
        const state = new Map<string, 'visiting' | 'done'>();
        const path: string[] = [];
        const visit = (id: string): void => {
            const s = state.get(id);
            if (s === 'done') return;
            if (s === 'visiting') {
                // A busca anda da entrada para a origem; o caminho sai no sentido dos dados.
                const cycle = [...path.slice(path.indexOf(id)), id].reverse();
                throw new NodeGraphError('cycle', `NodeGraph: ciclo ${cycle.join(' → ')}`, cycle);
            }
            state.set(id, 'visiting');
            path.push(id);
            for (const input of inputsOf(this.#resolved.get(id)!)) {
                const src = this.#sources.get(`${id}.${input}`);
                if (src !== undefined) visit(split(src)[0]);
            }
            path.pop();
            state.set(id, 'done');
        };
        for (const id of this.#resolved.keys()) visit(id);
    }
}

function split(ref: string): [string, string] {
    const dot = ref.indexOf('.');
    if (dot < 0)
        throw new NodeGraphError('unknown-port', `NodeGraph: '${ref}' não é 'nó.porta'`, [ref]);
    return [ref.slice(0, dot), ref.slice(dot + 1)];
}

/**
 * Expande os sub-grafos de conjunto (spec 031, US4): os nós de dentro entram como `uso_nó`, com os valores do sub-grafo
 * e, nos expostos, os do uso; as ligações de dentro com o prefixo; as de fora que chegam ou saem do uso, religadas às
 * portas de dentro que ele declara.
 */
function expand(
    nodes: Readonly<Record<string, GraphNode>>,
    links: readonly GraphLink[],
): { nodes: Record<string, FlatNode>; links: GraphLink[] } {
    const out: Record<string, FlatNode> = {};
    const subs = new Map<string, SetSubgraph>();
    for (const [id, node] of Object.entries(nodes)) {
        const sub =
            'level' in node && node.level === 'subgraph'
                ? node
                : 'definition' in node && node.definition.level === 'subgraph'
                  ? node.definition
                  : undefined;
        if (sub === undefined) {
            out[id] = node as FlatNode;
            continue;
        }
        subs.set(id, sub);
        const useValues = 'definition' in node ? node.values : {};
        for (const [iid, inner] of Object.entries(sub.graph.flatNodes)) {
            const key = `${id}_${iid}`;
            if ('kind' in inner) {
                out[key] = inner;
                continue;
            }
            const resolved = sub.graph.node(iid);
            const def = resolved.definition ?? resolved.set!;
            const values: Record<string, ExtensionParamValue> = { ...resolved.values };
            for (const p of Object.keys(def.params)) {
                const v = useValues[`${iid}_${p}`];
                if (v !== undefined) values[p] = v;
            }
            out[key] = { definition: def, values: Object.freeze(values) } as FlatNode;
        }
    }
    const remap = (ref: string, side: 'out' | 'in'): string => {
        const [id, port] = split(ref);
        const sub = subs.get(id);
        if (sub === undefined) return ref;
        const inner = (side === 'out' ? sub.outputs : sub.inputs)[port];
        if (inner === undefined)
            throw new NodeGraphError(
                'unknown-port',
                `NodeGraph: '${ref}' não é ${side === 'out' ? 'saída' : 'entrada'} do sub-grafo '${sub.name}'`,
                [id, port],
            );
        return `${id}_${inner}`;
    };
    const flatLinks: GraphLink[] = [];
    for (const [id, sub] of subs)
        for (const [from, to] of sub.graph.flatLinks)
            flatLinks.push([`${id}_${from}`, `${id}_${to}`]);
    for (const [from, to] of links) flatLinks.push([remap(from, 'out'), remap(to, 'in')]);
    return { nodes: out, links: flatLinks };
}

function resolve(id: string, node: FlatNode): ResolvedNode {
    if ('kind' in node)
        return { id, definition: undefined, set: undefined, argument: node, values: {} };
    const def = 'definition' in node ? node.definition : node;
    const values = 'definition' in node ? node.values : {};
    return def.level === 'set'
        ? { id, definition: undefined, set: def, argument: undefined, values }
        : { id, definition: def, set: undefined, argument: undefined, values };
}

/** Tipo de porta usado na definição (reexport para quem monta grafos). */
export type { PortType };
