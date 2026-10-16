import type { ExtensionParamType, ExtensionParamValue } from '../contracts/ExtensionParams';
import { wgslModule } from '../shaders/WgslModule';
import { POINT_PARAMS } from '../shaders/WgslPoint';
import { defineNode, type NodeContext, type NodeDefinition, type PortType } from './NodeDefinition';
import type { NodeGraph, SetSubgraph, SetSubgraphUse } from './NodeGraph';
import { NodeGraphError } from './NodeGraphError';
import type { SetNodeDefinition } from './SetNode';

/** Opções de um sub-grafo de ponto. */
export interface PointSubgraphOptions {
    /** Nome do nó (registro, mensagens). */
    readonly name: string;
    /** Entradas: argumento do grafo (`graphArgument`) → tipo, na ordem das portas. */
    readonly inputs?: Readonly<Record<string, PortType>>;
    /** Parâmetros expostos (`nó.parâmetro`): viram parâmetros do nó, com valor por uso. Os outros ficam no código. */
    readonly expose?: readonly string[];
}

/** Opções de um sub-grafo de conjunto. */
export interface SetSubgraphOptions {
    readonly name: string;
    /** Entradas do nó → a entrada de dentro que alimentam (`nó.porta`). */
    readonly inputs?: Readonly<Record<string, string>>;
    /** Saídas do nó → a saída de dentro (`nó.porta`). */
    readonly outputs?: Readonly<Record<string, string>>;
    /** Parâmetros expostos (`nó.parâmetro`), com valor por uso. */
    readonly expose?: readonly string[];
}

/** Origem de cada sub-grafo de ponto (o grafo e as opções): o que a serialização grava no lugar do código gerado. */
const origins = new WeakMap<
    NodeDefinition,
    { readonly graph: NodeGraph; readonly options: PointSubgraphOptions }
>();

/** O grafo e as opções de que o nó `definition` foi gerado por `Subgraph.point`, ou `undefined`. */
export function subgraphOrigin(
    definition: NodeDefinition,
): { readonly graph: NodeGraph; readonly options: PointSubgraphOptions } | undefined {
    return origins.get(definition);
}

/** FNV-1a de 32 bits em hexadecimal. */
function fnv(text: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
}

/** Literal WGSL exato de um valor de parâmetro (o f32 mais próximo, como o envio ao buffer). */
function literal(type: ExtensionParamType, value: ExtensionParamValue): string {
    const list = typeof value === 'number' ? [value] : [...value];
    const scalar =
        type.endsWith('f') || type === 'f32'
            ? 'f'
            : type.endsWith('u') || type === 'u32'
              ? 'u'
              : 'i';
    const one = (v: number): string =>
        scalar === 'f' ? `f32(${String(v)})` : scalar === 'u' ? `${v >>> 0}u` : `i32(${v | 0})`;
    return list.length === 1 && !type.startsWith('vec')
        ? one(list[0]!)
        : `${type}(${list.map(one).join(', ')})`;
}

/** Nós que expõem `expose`: `nó.parâmetro` → `nó_parâmetro`, conferindo que existem. */
function exposed(graph: NodeGraph, name: string, expose: readonly string[]): string[] {
    const params = graph.allParams();
    return expose.map((ref) => {
        const key = ref.replace('.', '_');
        if (!(key in params))
            throw new NodeGraphError(
                'unknown-port',
                `Subgraph('${name}'): '${ref}' não é parâmetro do grafo`,
                [ref],
            );
        return key;
    });
}

/** Sub-grafos (spec 031, US4): um grafo usado como nó de outro grafo. */
export const Subgraph = {
    /**
     * Sub-grafo de ponto: um nó cuja função é o grafo compilado (`sub_<hash>`, emitida uma vez por shader — usos
     * repetidos compartilham o módulo). Entradas: os argumentos do grafo; saída: a do grafo; parâmetros: os expostos.
     * Os estágios do nó: os comuns a todos os nós de dentro.
     *
     * @throws NodeGraphError grafo sem saída, entrada que o grafo não usa, parâmetro exposto inexistente, sem estágio
     *   comum.
     */
    point(graph: NodeGraph, options: PointSubgraphOptions): NodeDefinition {
        const output = graph.output;
        if (output === undefined)
            throw new NodeGraphError(
                'target',
                `Subgraph('${options.name}'): o grafo não tem saída`,
                [options.name],
            );
        const inputs = options.inputs ?? {};
        const keys = exposed(graph, options.name, options.expose ?? []);
        const params = graph.params();
        const values = graph.values();
        const contexts = (['fragment', 'vertex', 'compute'] as const).filter((c) =>
            graph.order().every((id) => graph.node(id).definition?.contexts.includes(c) ?? true),
        );
        if (contexts.length === 0)
            throw new NodeGraphError(
                'context',
                `Subgraph('${options.name}'): nenhum estágio comum aos nós`,
                [options.name],
            );
        const [outId, outPort] = [
            output.slice(0, output.indexOf('.')),
            output.slice(output.indexOf('.') + 1),
        ];
        const outNode = graph.node(outId);
        const returns =
            outNode.argument !== undefined
                ? outPort === 'value'
                    ? inputs[outNode.argument.name]
                    : outNode.argument.fields[outPort]
                : outNode.definition?.outputs[outPort];
        if (returns === undefined)
            throw new NodeGraphError(
                'target',
                `Subgraph('${options.name}'): tipo da saída '${output}' desconhecido`,
                [output],
            );
        // A identidade: o grafo (forma e valores embutidos), as entradas e os expostos.
        const shape = JSON.stringify({
            nodes: Object.keys(graph.nodes),
            links: graph.links,
            output,
            inputs,
            keys,
            baked: Object.fromEntries(Object.entries(values).filter(([k]) => !keys.includes(k))),
            defs: graph.order().map((id) => graph.node(id).definition?.name ?? 'arg'),
        });
        const hash = fnv(shape);
        const fn = `sub_${hash}`;
        const struct = `Sub_${hash}`;
        const names = Object.keys(inputs);
        const code = graph.compile({
            name: options.name,
            context: contexts[0]!,
            paramsAlias: struct,
            required: {
                name: `${fn}_impl`,
                params: [...Object.values(inputs), POINT_PARAMS],
                returns,
                names: [...names, 'data'],
            },
        });
        const fields = Object.entries(params);
        const source = [
            `// Sub-grafo '${options.name}' (spec 031): o grafo compilado; parâmetros expostos pelo nó, os outros no código.`,
            `struct ${struct} {`,
            ...(fields.length === 0
                ? ['    _unused: u32,']
                : fields.map(([n, t]) => `    ${n}: ${t},`)),
            '}',
            code,
            `fn ${fn}(${[...names.map((n) => `${n}: ${inputs[n]}`), ...keys.map((k) => `${k}: ${params[k]}`)].join(', ')}) -> ${returns} {`,
            `    return ${fn}_impl(${[
                ...names,
                `${struct}(${
                    fields.length === 0
                        ? '0u'
                        : fields
                              .map(([n, t]) => (keys.includes(n) ? n : literal(t, values[n] ?? 0)))
                              .join(', ')
                })`,
            ].join(', ')});`,
            '}',
        ].join('\n');
        const module = wgslModule({ name: `subgraph_${hash}`, source, requires: graph.modules() });
        const definition = defineNode({
            name: options.name,
            inputs,
            outputs: { value: returns },
            params: Object.fromEntries(
                keys.map((k) => [k, { type: params[k]!, default: values[k] ?? 0 }]),
            ),
            code: module,
            fn,
            contexts,
        });
        origins.set(definition, { graph, options });
        return definition;
    },

    /**
     * Sub-grafo de conjunto: expandido no grafo que o usa (ver `SetSubgraph`).
     *
     * @throws NodeGraphError entrada ou saída que não é porta de nó de conjunto de dentro, parâmetro exposto inexistente.
     */
    set(graph: NodeGraph, options: SetSubgraphOptions): SetSubgraph {
        const keys = exposed(graph, options.name, options.expose ?? []);
        const all = graph.allParams();
        const values = graph.allValues();
        const check = (ref: string, side: 'inputs' | 'outputs'): void => {
            const id = ref.slice(0, ref.indexOf('.'));
            const port = ref.slice(ref.indexOf('.') + 1);
            const set: SetNodeDefinition | undefined =
                graph.nodes[id] === undefined ? undefined : graph.node(id).set;
            if (set === undefined || !(port in set[side]))
                throw new NodeGraphError(
                    'unknown-port',
                    `Subgraph('${options.name}'): '${ref}' não é ${side === 'inputs' ? 'entrada' : 'saída'} de nó de conjunto`,
                    [ref],
                );
        };
        for (const ref of Object.values(options.inputs ?? {})) {
            check(ref, 'inputs');
            if (!graph.open.includes(ref))
                throw new NodeGraphError(
                    'unknown-port',
                    `Subgraph('${options.name}'): a entrada '${ref}' não está aberta no grafo ('open')`,
                    [ref],
                );
        }
        for (const ref of Object.values(options.outputs ?? {})) check(ref, 'outputs');
        const params = Object.fromEntries(
            keys.map((k) => [k, { type: all[k]!, default: values[k] ?? 0 }]),
        );
        const definition: SetSubgraph = Object.freeze({
            level: 'subgraph' as const,
            name: options.name,
            graph,
            inputs: Object.freeze({ ...(options.inputs ?? {}) }),
            outputs: Object.freeze({ ...(options.outputs ?? {}) }),
            expose: Object.freeze([...(options.expose ?? [])]),
            params: Object.freeze(params),
            with(v: Readonly<Record<string, ExtensionParamValue>>): SetSubgraphUse {
                for (const k of Object.keys(v))
                    if (!(k in params))
                        throw new NodeGraphError(
                            'node-signature',
                            `Subgraph('${options.name}'): valor para parâmetro não exposto '${k}'`,
                            [k],
                        );
                return Object.freeze({ definition, values: Object.freeze({ ...v }) });
            },
        });
        return definition;
    },
};

/** Tipos dos sub-grafos de conjunto (definidos com o grafo). */
export type { SetSubgraph, SetSubgraphUse };

/** Estágios de um nó de ponto (reexport para quem monta sub-grafos). */
export type { NodeContext };
