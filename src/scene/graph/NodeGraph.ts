import type { ExtensionParamType, ExtensionParamValue } from '../contracts/ExtensionParams';
import type { WgslModule } from '../shaders/WgslModule';
import { POINT_PARAMS, type WgslPoint } from '../shaders/WgslPoint';
import type { NodeDefinition, NodeUse, PortType } from './NodeDefinition';
import { NodeGraphError } from './NodeGraphError';

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

/** Nó do grafo: uso de uma definição (com valores), a definição (valores padrão) ou um argumento do ponto. */
export type GraphNode = NodeUse | NodeDefinition | GraphArgument;

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

/** Um nó resolvido: id, definição (ou argumento) e valores. */
export interface ResolvedNode {
    readonly id: string;
    readonly definition: NodeDefinition | undefined;
    readonly argument: GraphArgument | undefined;
    readonly values: Readonly<Record<string, ExtensionParamValue>>;
}

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
 * Grafo de nós de ponto (spec 031, US2): nós ligados por portas tipadas, avaliados por amostra. Imutável; validado na
 * criação — nós e portas existentes, uma ligação por entrada, toda entrada ligada ou com padrão, sem ciclos (com o
 * caminho) — e, para um ponto alvo, os tipos e os estágios (`compile`). A identidade é a forma: definições, ligações e
 * saída; os valores dos parâmetros não entram (mudar um valor não recompila).
 */
export class NodeGraph {
    readonly nodes: Readonly<Record<string, GraphNode>>;
    readonly links: readonly GraphLink[];
    readonly output: string | undefined;
    readonly #resolved = new Map<string, ResolvedNode>();
    /** Entrada (`nó.porta`) → origem (`nó.porta`). */
    readonly #sources = new Map<string, string>();

    constructor(options: NodeGraphOptions) {
        this.nodes = Object.freeze({ ...options.nodes });
        this.links = Object.freeze(options.links.map((l) => Object.freeze([...l] as const)));
        this.output = options.output;
        for (const [id, node] of Object.entries(this.nodes)) {
            if (!IDENT.test(id))
                throw new NodeGraphError(
                    'unknown-node',
                    `NodeGraph: id '${id}' não é identificador WGSL`,
                    [id],
                );
            this.#resolved.set(id, resolve(id, node));
        }
        for (const [from, to] of this.links) {
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
        for (const node of this.#resolved.values()) {
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
            if (node.definition !== undefined) {
                for (const input of Object.keys(node.definition.inputs)) {
                    const src = this.#sources.get(`${id}.${input}`);
                    if (src !== undefined) visit(src.slice(0, src.indexOf('.')));
                }
            }
            out.push(id);
        };
        if (this.output !== undefined) visit(this.output.slice(0, this.output.indexOf('.')));
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
    compile(point: WgslPoint): string {
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
        } else if (
            side === 'out' ? port in node.definition!.outputs : port in node.definition!.inputs
        )
            return;
        throw new NodeGraphError(
            'unknown-port',
            `NodeGraph: '${ref}' não é ${side === 'out' ? 'saída' : 'entrada'} do nó '${id}'`,
            [id, port],
        );
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
            const def = this.#resolved.get(id)!.definition;
            for (const input of Object.keys(def?.inputs ?? {})) {
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

function resolve(id: string, node: GraphNode): ResolvedNode {
    if ('kind' in node) return { id, definition: undefined, argument: node, values: {} };
    if ('definition' in node)
        return { id, definition: node.definition, argument: undefined, values: node.values };
    return { id, definition: node, argument: undefined, values: {} };
}

/** Tipo de porta usado na definição (reexport para quem monta grafos). */
export type { PortType };
