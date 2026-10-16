import type { ExtensionParamValue } from '../contracts/ExtensionParams';
import { wgslModule, type WgslModule } from '../shaders/WgslModule';
import {
    defineNode,
    type NodeContext,
    type NodeDefinition,
    type NodeParam,
    type PortType,
} from './NodeDefinition';
import { graphArgument, NodeGraph, type GraphLink, type GraphNode } from './NodeGraph';
import { NodeGraphError } from './NodeGraphError';
import type { NodeRegistry } from './NodeRegistry';
import type { SetNodeDefinition } from './SetNode';
import {
    Subgraph,
    subgraphOrigin,
    type PointSubgraphOptions,
    type SetSubgraph,
    type SetSubgraphOptions,
} from './Subgraph';

/** Versão do formato de `toJSON`. */
export const GRAPH_JSON_VERSION = 1;

/** Nó WGSL do usuário serializado com o código (sem dependências de módulo). */
export interface InlineNodeJSON {
    readonly name: string;
    readonly inputs: Readonly<Record<string, PortType>>;
    readonly outputs: Readonly<Record<string, PortType>>;
    readonly params: Readonly<Record<string, NodeParam>>;
    readonly defaults: Readonly<Record<string, string>>;
    readonly fn: string;
    readonly contexts: readonly NodeContext[];
    readonly module: string;
    readonly code: string;
}

/** Um nó serializado. */
export type NodeJSON =
    | {
          readonly id: string;
          readonly type: string;
          readonly values?: Readonly<Record<string, ExtensionParamValue>>;
      }
    | {
          readonly id: string;
          readonly type: 'argument';
          readonly name: string;
          readonly fields: Readonly<Record<string, PortType>>;
      }
    | {
          readonly id: string;
          readonly type: 'wgsl';
          readonly definition: InlineNodeJSON;
          readonly values?: Readonly<Record<string, ExtensionParamValue>>;
      }
    | {
          readonly id: string;
          readonly type: 'subgraph';
          readonly subgraph: string;
          readonly values?: Readonly<Record<string, ExtensionParamValue>>;
      };

/** Um sub-grafo serializado: o grafo e as opções. */
export type SubgraphJSON =
    | { readonly kind: 'point'; readonly graph: GraphJSON; readonly options: PointSubgraphOptions }
    | { readonly kind: 'set'; readonly graph: GraphJSON; readonly options: SetSubgraphOptions };

/** Um grafo serializado (spec 031, R11). */
export interface GraphJSON {
    readonly version: number;
    readonly nodes: readonly NodeJSON[];
    readonly links: readonly GraphLink[];
    readonly output?: string;
    readonly open?: readonly string[];
    readonly subgraphs?: Readonly<Record<string, SubgraphJSON>>;
}

/**
 * Grafo → JSON (spec 031, R11): nós registrados pelo nome do tipo e os valores do uso; argumentos com os campos; nós
 * WGSL do usuário (fora do registro, sem dependências) com o código; sub-grafos pela estrutura (o grafo e as opções,
 * uma vez por nome). Ida e volta (`fromJSON`) dá a mesma forma e o mesmo código.
 *
 * @throws NodeGraphError (`serialization`) nó fora do registro que não se serializa (de conjunto, ou WGSL com
 *   dependências), ou dois sub-grafos diferentes com o mesmo nome.
 */
export function toJSON(graph: NodeGraph, registry: NodeRegistry): GraphJSON {
    const subgraphs: Record<string, SubgraphJSON> = {};
    const seen = new Map<string, unknown>();
    const subgraph = (name: string, origin: unknown, make: () => SubgraphJSON): void => {
        const known = seen.get(name);
        if (known !== undefined && known !== origin)
            throw new NodeGraphError(
                'serialization',
                `toJSON: dois sub-grafos diferentes com o nome '${name}'`,
                [name],
            );
        if (known === undefined) {
            seen.set(name, origin);
            subgraphs[name] = make();
        }
    };
    const nodes = Object.entries(graph.nodes).map(([id, node]): NodeJSON => {
        if ('kind' in node) return { id, type: 'argument', name: node.name, fields: node.fields };
        const def = 'definition' in node ? node.definition : node;
        const values =
            'definition' in node && Object.keys(node.values).length > 0
                ? { values: node.values }
                : {};
        if (def.level === 'subgraph') {
            subgraph(def.name, def, () => ({
                kind: 'set',
                graph: toJSON(def.graph, registry),
                options: {
                    name: def.name,
                    inputs: def.inputs,
                    outputs: def.outputs,
                    expose: def.expose,
                },
            }));
            return { id, type: 'subgraph', subgraph: def.name, ...values };
        }
        if (registry.get(def.name) === def) return { id, type: def.name, ...values };
        if (def.level === 'set')
            throw new NodeGraphError(
                'serialization',
                `toJSON: o nó de conjunto '${id}' (${def.name}) não está no registro`,
                [id, def.name],
            );
        const origin = subgraphOrigin(def);
        if (origin !== undefined) {
            subgraph(def.name, def, () => ({
                kind: 'point',
                graph: toJSON(origin.graph, registry),
                options: origin.options,
            }));
            return { id, type: 'subgraph', subgraph: def.name, ...values };
        }
        if (def.code.requires.length > 0)
            throw new NodeGraphError(
                'serialization',
                `toJSON: o nó WGSL '${id}' (${def.name}) não está no registro e o código depende de módulos (${def.code.requires.map((m) => m.name).join(', ')})`,
                [id, def.name],
            );
        return {
            id,
            type: 'wgsl',
            definition: {
                name: def.name,
                inputs: def.inputs,
                outputs: def.outputs,
                params: def.params,
                defaults: def.defaults,
                fn: def.fn,
                contexts: def.contexts,
                module: def.code.name,
                code: def.code.source,
            },
            ...values,
        };
    });
    return {
        version: GRAPH_JSON_VERSION,
        nodes,
        links: graph.links.map(([a, b]) => [a, b] as const),
        ...(graph.output !== undefined ? { output: graph.output } : {}),
        ...(graph.open.length > 0 ? { open: graph.open } : {}),
        ...(Object.keys(subgraphs).length > 0 ? { subgraphs } : {}),
    };
}

/** Nós WGSL do usuário reconstruídos, por código (a mesma definição a cada leitura: mesmo módulo, mesmo pipeline). */
const inline = new Map<string, NodeDefinition>();

/**
 * Módulos dos nós WGSL do usuário, por nome e código: nós que vinham do mesmo módulo voltam a compartilhar um módulo
 * (dois módulos distintos com o mesmo nome não se montam no mesmo shader).
 */
const inlineModules = new Map<string, WgslModule>();

/**
 * JSON → grafo (spec 031, R11): resolve os tipos pelo `registry`, reconstrói os nós WGSL do usuário pelo código e os
 * sub-grafos pela estrutura. Validado como qualquer grafo.
 *
 * @throws NodeGraphError (`serialization`) versão desconhecida, tipo fora do registro (nomeando o tipo e o nó),
 *   sub-grafo não declarado.
 */
export function fromJSON(json: GraphJSON, registry: NodeRegistry): NodeGraph {
    if (json.version !== GRAPH_JSON_VERSION)
        throw new NodeGraphError(
            'serialization',
            `fromJSON: versão ${String(json.version)} (esperada ${GRAPH_JSON_VERSION})`,
            [String(json.version)],
        );
    const subgraphs = new Map<string, NodeDefinition | SetSubgraph>();
    const sub = (name: string, id: string): NodeDefinition | SetSubgraph => {
        let def = subgraphs.get(name);
        if (def !== undefined) return def;
        const s = json.subgraphs?.[name];
        if (s === undefined)
            throw new NodeGraphError(
                'serialization',
                `fromJSON: o nó '${id}' usa o sub-grafo '${name}', não declarado`,
                [id, name],
            );
        const graph = fromJSON(s.graph, registry);
        def =
            s.kind === 'point' ? Subgraph.point(graph, s.options) : Subgraph.set(graph, s.options);
        subgraphs.set(name, def);
        return def;
    };
    const nodes: Record<string, GraphNode> = {};
    for (const n of json.nodes) {
        if (n.type === 'argument' && 'name' in n) {
            nodes[n.id] = graphArgument(n.name, n.fields);
            continue;
        }
        const values = 'values' in n ? n.values : undefined;
        let def: NodeDefinition | SetNodeDefinition | SetSubgraph;
        if (n.type === 'subgraph' && 'subgraph' in n) def = sub(n.subgraph, n.id);
        else if (n.type === 'wgsl' && 'definition' in n) def = inlineNode(n.definition);
        else {
            const known = registry.get(n.type);
            if (known === undefined)
                throw new NodeGraphError(
                    'serialization',
                    `fromJSON: tipo de nó '${n.type}' (nó '${n.id}') não está no registro`,
                    [n.id, n.type],
                );
            def = known;
        }
        nodes[n.id] = values === undefined ? def : def.with(values);
    }
    return new NodeGraph({
        nodes,
        links: json.links,
        ...(json.output !== undefined ? { output: json.output } : {}),
        ...(json.open !== undefined ? { open: json.open } : {}),
    });
}

function inlineModule(name: string, source: string): WgslModule {
    const key = `${name}\u0000${source}`;
    let module = inlineModules.get(key);
    if (module === undefined) {
        module = wgslModule({ name, source });
        inlineModules.set(key, module);
    }
    return module;
}

function inlineNode(d: InlineNodeJSON): NodeDefinition {
    const key = JSON.stringify(d);
    let def = inline.get(key);
    if (def === undefined) {
        def = defineNode({
            name: d.name,
            inputs: d.inputs,
            outputs: d.outputs,
            params: d.params,
            defaults: d.defaults,
            code: inlineModule(d.module, d.code),
            fn: d.fn,
            contexts: d.contexts,
        });
        inline.set(key, def);
    }
    return def;
}
