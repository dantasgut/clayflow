import type { ExtensionParamType, ExtensionParamValue } from '../contracts/ExtensionParams';
import { parseWgslFunctions } from '../shaders/WgslPoint';
import type { WgslModule } from '../shaders/WgslModule';
import { NodeGraphError } from './NodeGraphError';

/** Tipo de uma porta: um tipo WGSL (`f32`, `vec3f`, `u32`, um struct gerado…). */
export type PortType = string;

/** Estágio em que um nó pode ser avaliado. */
export type NodeContext = 'fragment' | 'vertex' | 'compute';

/** Parâmetro de um nó: tipo e valor padrão. Vive no registro do grafo; mudar o valor não recompila. */
export interface NodeParam {
    /** Tipo do parâmetro. */
    readonly type: ExtensionParamType;
    /** Valor padrão (0 sem valor). */
    readonly default?: ExtensionParamValue;
}

/** Opções de `defineNode` (nó de ponto). */
export interface NodeDefinitionOptions {
    /** Nome do nó (único no registro: `noise.gradient3`, `math.add`…). */
    readonly name: string;
    /** Entradas: nome → tipo, na ordem dos parâmetros da função. */
    readonly inputs?: Readonly<Record<string, PortType>>;
    /**
     * Saídas: nome → tipo. Uma saída: o retorno da função. Várias: a função devolve um struct cujos campos têm os nomes
     * e os tipos das saídas.
     */
    readonly outputs: Readonly<Record<string, PortType>>;
    /** Parâmetros: nome → tipo e padrão; entram na função depois das entradas, na ordem declarada. */
    readonly params?: Readonly<Record<string, NodeParam>>;
    /** Expressão WGSL de uma entrada sem ligação (ex.: `'0.0'`); entrada sem ligação nem padrão é erro. */
    readonly defaults?: Readonly<Record<string, string>>;
    /** Módulo WGSL com a função do nó (e o struct de saída). */
    readonly code: WgslModule;
    /** Nome da função do nó no módulo. */
    readonly fn: string;
    /** Estágios em que o nó vale (padrão: todos). Ex.: derivadas de tela só em `fragment`. */
    readonly contexts?: readonly NodeContext[];
    /**
     * Marcas livres do nó (spec 011), unidas pela compilação do grafo (`NodeGraph.tags()`): quem consome o grafo decide
     * o que significam — ex.: os lobos de espalhamento que um nó de material produz, para especializar o shader. O núcleo
     * do grafo não interpreta.
     */
    readonly tags?: readonly string[];
}

/** Definição de um nó de ponto (imutável): portas, parâmetros, código. */
export interface NodeDefinition {
    /** Nível: avaliado por amostra, fundido na função do grafo. */
    readonly level: 'point';
    readonly name: string;
    readonly inputs: Readonly<Record<string, PortType>>;
    readonly outputs: Readonly<Record<string, PortType>>;
    readonly params: Readonly<Record<string, NodeParam>>;
    readonly defaults: Readonly<Record<string, string>>;
    readonly code: WgslModule;
    readonly fn: string;
    readonly contexts: readonly NodeContext[];
    /** Marcas livres do nó (ver `NodeDefinitionOptions.tags`). */
    readonly tags: readonly string[];
    /** Uso do nó com valores de parâmetros próprios (o código é o mesmo). */
    with(values: Readonly<Record<string, ExtensionParamValue>>): NodeUse;
}

/** Um nó no grafo: a definição e os valores dos parâmetros deste uso. */
export interface NodeUse {
    readonly definition: NodeDefinition;
    readonly values: Readonly<Record<string, ExtensionParamValue>>;
}

const norm = (t: string): string => t.replace(/\s+/g, '');
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Campos de um struct WGSL (`nome: tipo`) definido em `source`, ou `undefined`. */
export function structFields(source: string, name: string): Map<string, string> | undefined {
    const m = new RegExp(`struct\\s+${name}\\s*\\{([^}]*)\\}`).exec(source);
    if (m === null) return undefined;
    const out = new Map<string, string>();
    for (const part of m[1]!.split(',')) {
        const colon = part.indexOf(':');
        if (colon < 0) continue;
        const field = part
            .slice(0, colon)
            .replace(/@[^\s]+/g, '')
            .trim();
        if (field.length > 0) out.set(field, norm(part.slice(colon + 1)));
    }
    return out;
}

/**
 * Define um nó de ponto (spec 031, FR-013): confere na criação que a função existe no módulo com a assinatura das
 * portas e dos parâmetros (entradas, depois parâmetros; retorno = a saída, ou um struct com os campos das saídas).
 *
 * @throws NodeGraphError (`node-signature`) nomeando o nó, a porta e o esperado.
 */
export function defineNode(options: NodeDefinitionOptions): NodeDefinition {
    const inputs = Object.freeze({ ...(options.inputs ?? {}) });
    const outputs = Object.freeze({ ...options.outputs });
    const params = Object.freeze({ ...(options.params ?? {}) });
    const fail = (message: string): never => {
        throw new NodeGraphError('node-signature', `defineNode('${options.name}'): ${message}`, [
            options.name,
        ]);
    };
    for (const n of [...Object.keys(inputs), ...Object.keys(outputs), ...Object.keys(params)])
        if (!IDENT.test(n)) fail(`'${n}' não é identificador WGSL`);
    if (Object.keys(outputs).length === 0) fail('nenhuma saída');
    const fn = parseWgslFunctions(options.code.source).get(options.fn);
    if (fn === undefined) fail(`função '${options.fn}' não está no módulo '${options.code.name}'`);
    const expected = [...Object.values(inputs), ...Object.values(params).map((p) => p.type)].map(
        norm,
    );
    if (fn!.params.length !== expected.length || fn!.params.some((t, k) => t !== expected[k])) {
        fail(
            `'${options.fn}' recebe (${fn!.params.join(', ')}); as portas pedem (${expected.join(', ')})`,
        );
    }
    const outs = Object.entries(outputs);
    if (outs.length === 1) {
        if (fn!.returns !== norm(outs[0]![1]))
            fail(
                `'${options.fn}' devolve '${fn!.returns}'; a saída '${outs[0]![0]}' é '${outs[0]![1]}'`,
            );
    } else {
        const fields = structFields(options.code.source, fn!.returns);
        if (fields === undefined)
            fail(`várias saídas: '${options.fn}' deve devolver um struct definido no módulo`);
        for (const [name, type] of outs) {
            if (fields!.get(name) !== norm(type))
                fail(`a saída '${name}: ${type}' não é campo do struct '${fn!.returns}'`);
        }
    }
    const definition: NodeDefinition = Object.freeze({
        level: 'point' as const,
        name: options.name,
        inputs,
        outputs,
        params,
        defaults: Object.freeze({ ...(options.defaults ?? {}) }),
        code: options.code,
        fn: options.fn,
        contexts: Object.freeze([...(options.contexts ?? ['fragment', 'vertex', 'compute'])]),
        tags: Object.freeze([...new Set(options.tags ?? [])]),
        with(values: Readonly<Record<string, ExtensionParamValue>>): NodeUse {
            for (const k of Object.keys(values))
                if (!(k in params)) fail(`valor para parâmetro desconhecido '${k}'`);
            return Object.freeze({ definition, values: Object.freeze({ ...values }) });
        },
    });
    return definition;
}
