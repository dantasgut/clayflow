import type {
    AnyBufferSpec,
    EngineCore,
    Frame,
    IndirectBufferSpec,
    StorageBufferSpec,
} from '../contracts/gpu';
import type { WorkContext } from '../flows/FlowWork';
import type { ExtensionParamValue } from '../contracts/ExtensionParams';
import type { StructSchema } from '../descriptors/StructSchema';
import type { BindingSource } from '../flows/FlowBinding';
import type { BindablePoint } from '../shaders/bindPoints';
import type { WgslModule } from '../shaders/WgslModule';
import type { WgslPoint } from '../shaders/WgslPoint';
import type { WgslResource } from '../shaders/WgslResource';
import type { NodeParam } from './NodeDefinition';
import { NodeGraphError } from './NodeGraphError';

/**
 * Tipo de uma porta de conjunto (spec 031, R10): um nome (a identidade nas ligações — `mesh` só liga em `mesh`) e os
 * conjuntos que a porta carrega, cada um com o schema do elemento (ex.: malha = vértices `MeshVertex` + triângulos).
 */
export interface SetType {
    readonly name: string;
    readonly sets: Readonly<Record<string, StructSchema>>;
}

/** Tipo de porta de conjunto `name` com os conjuntos `sets`. */
export function setType(name: string, sets: Readonly<Record<string, StructSchema>>): SetType {
    return Object.freeze({ name, sets: Object.freeze({ ...sets }) });
}

/** O que a compilação de um grafo de ponto usa do ponto alvo: a assinatura, o alias dos parâmetros e o estágio. */
export type PointTarget = Pick<WgslPoint, 'name' | 'required' | 'context' | 'paramsAlias'>;

/**
 * Entrada de ponto de um nó de conjunto (spec 031, FR-018): o grafo de ponto ligado a ela é compilado contra `target`
 * (assinatura com os argumentos por elemento e os parâmetros) e fundido no kernel do nó, que chama a função `at` —
 * a mesma assinatura sem os parâmetros. Sem ligação, o kernel usa o pronto de `at` (o valor padrão da entrada).
 */
export interface SetPointInput {
    readonly kind: 'point';
    readonly target: PointTarget;
    /** Ponto vinculável que o kernel chama (o pronto devolve o padrão); trocado pelo grafo compilado. */
    readonly at: BindablePoint;
    /** Nome da função de `at`. */
    readonly fn: string;
}

/** Entrada de ponto: o grafo ligado é compilado contra `target` e chamado pelo kernel por `fn` (ponto `at`). */
export function setPointInput(target: PointTarget, at: BindablePoint, fn: string): SetPointInput {
    return Object.freeze({ kind: 'point' as const, target, at, fn });
}

/** Um conjunto alocado: o buffer, a capacidade (elementos) e o índice do registro `SetCount` com a contagem. */
export interface SetBuffer {
    readonly buffer: StorageBufferSpec;
    readonly capacity: number;
    readonly slot: number;
}

/** Grafo de ponto fundido numa entrada: o módulo que implementa `at` e a fonte do uniform dos parâmetros. */
export interface FusedPoint {
    readonly module: WgslModule;
    readonly params: BindingSource;
    /** O recurso declarado do uniform dos parâmetros (ligar com `params`). */
    readonly resource: WgslResource;
}

/** O que a instância de um nó de conjunto recebe do `GraphFlow`. */
export interface SetNodeContext {
    readonly core: EngineCore;
    /**
     * O espaço de trabalho do nó (spec 039): o Resource de trabalho do `GraphFlow` dono, o diretório da C2 e o core.
     * Parâmetros, buffers próprios e os primitivos (`PrefixSum`, `Compaction`…) declaram neles os seus descritores.
     */
    readonly work: WorkContext;
    /** Prefixo único dos recursos desta instância. */
    readonly id: string;
    /** Os registros `SetCount` do grafo (descritor `indirect`, lido como `array<SetCount>`). */
    readonly counts: IndirectBufferSpec;
    /** Conjunto ligado à entrada `port`. */
    input(port: string, set: string): SetBuffer;
    /** Conjunto alocado para a saída `port`. */
    output(port: string, set: string): SetBuffer;
    /** Grafo de ponto fundido na entrada `port`, ou `undefined` (o kernel usa o pronto). */
    point(port: string): FusedPoint | undefined;
    /** Valores atuais dos parâmetros do nó (pelo nome do parâmetro). */
    values(): Readonly<Record<string, ExtensionParamValue>>;
    /** Buffer `descId` do Resource alvo do grafo (a geometria de saída), ou `undefined`. */
    target(descId: string): Exclude<AnyBufferSpec, { subkind: 'staging' }> | undefined;
}

/** Instância de um nó de conjunto num grafo: grava os passes; reage a valores novos. */
export interface SetNodeInstance {
    /** Valores dos parâmetros mudaram (escrever uniforms). */
    update(): void;
    /** Grava os passes do nó (o grafo está desatualizado). */
    record(frame: Frame): void;
    /** Libera kernels e buffers próprios. */
    dispose(): void;
}

/** O que a regra de capacidade de um nó lê: valores dos parâmetros e capacidades das entradas. */
export interface CapacityContext {
    readonly values: Readonly<Record<string, ExtensionParamValue>>;
    /** Capacidade do conjunto `set` ligado à entrada `port`. */
    input(port: string, set: string): number;
}

/** Contagem de um conjunto de saída: da CPU (= a capacidade), da GPU (escrita por um kernel), ou a de uma entrada. */
export type SetCountRule = 'cpu' | 'gpu' | { readonly same: string };

/** Opções de `defineSetNode`. */
export interface SetNodeDefinitionOptions {
    readonly name: string;
    readonly inputs?: Readonly<Record<string, SetType | SetPointInput>>;
    readonly outputs?: Readonly<Record<string, SetType>>;
    readonly params?: Readonly<Record<string, NodeParam>>;
    /**
     * Capacidade de cada conjunto de saída (`'porta.conjunto'` → elementos), pelos valores e pelas entradas. Mudou com
     * um valor novo: o `GraphFlow` realoca e recria a instância.
     */
    readonly capacity?: (c: CapacityContext) => Readonly<Record<string, number>>;
    /** Contagem de cada conjunto de saída (`'porta.conjunto'`); padrão `cpu`. */
    readonly counts?: Readonly<Record<string, SetCountRule>>;
    /** O nó depende do tempo: o grafo é refeito a cada quadro. */
    readonly animated?: boolean;
    /** Cria a instância (kernels ligados aos conjuntos). */
    readonly create: (c: SetNodeContext) => SetNodeInstance;
}

/** Definição de um nó de conjunto (imutável). */
export interface SetNodeDefinition {
    readonly level: 'set';
    readonly name: string;
    readonly inputs: Readonly<Record<string, SetType | SetPointInput>>;
    readonly outputs: Readonly<Record<string, SetType>>;
    readonly params: Readonly<Record<string, NodeParam>>;
    readonly capacity: (c: CapacityContext) => Readonly<Record<string, number>>;
    readonly counts: Readonly<Record<string, SetCountRule>>;
    readonly animated: boolean;
    readonly create: (c: SetNodeContext) => SetNodeInstance;
    /** Uso do nó com valores próprios. */
    with(values: Readonly<Record<string, ExtensionParamValue>>): SetNodeUse;
}

/** Um nó de conjunto no grafo: a definição e os valores deste uso. */
export interface SetNodeUse {
    readonly definition: SetNodeDefinition;
    readonly values: Readonly<Record<string, ExtensionParamValue>>;
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Define um nó de conjunto (spec 031, R10): portas de conjunto e de ponto, parâmetros, a regra de capacidade e de
 * contagem de cada conjunto de saída e a fábrica da instância. Confere na criação os nomes e que toda regra nomeia um
 * conjunto de saída (`same`: um conjunto de entrada do mesmo schema).
 *
 * @throws NodeGraphError (`node-signature`) nomeando o nó e o problema.
 */
export function defineSetNode(options: SetNodeDefinitionOptions): SetNodeDefinition {
    const inputs = Object.freeze({ ...(options.inputs ?? {}) });
    const outputs = Object.freeze({ ...(options.outputs ?? {}) });
    const params = Object.freeze({ ...(options.params ?? {}) });
    const counts = Object.freeze({ ...(options.counts ?? {}) });
    const fail = (message: string): never => {
        throw new NodeGraphError('node-signature', `defineSetNode('${options.name}'): ${message}`, [
            options.name,
        ]);
    };
    for (const n of [...Object.keys(inputs), ...Object.keys(outputs), ...Object.keys(params)])
        if (!IDENT.test(n)) fail(`'${n}' não é identificador WGSL`);
    const outSets = new Map<string, StructSchema>();
    for (const [port, type] of Object.entries(outputs))
        for (const [set, schema] of Object.entries(type.sets))
            outSets.set(`${port}.${set}`, schema);
    const inSets = new Map<string, StructSchema>();
    for (const [port, type] of Object.entries(inputs)) {
        if ('kind' in type) continue;
        for (const [set, schema] of Object.entries(type.sets)) inSets.set(`${port}.${set}`, schema);
    }
    for (const [key, rule] of Object.entries(counts)) {
        const schema = outSets.get(key);
        if (schema === undefined) fail(`contagem para '${key}', que não é conjunto de saída`);
        if (typeof rule === 'object' && inSets.get(rule.same) !== schema)
            fail(
                `a contagem de '${key}' segue '${rule.same}', que não é conjunto de entrada do mesmo schema`,
            );
    }
    const definition: SetNodeDefinition = Object.freeze({
        level: 'set' as const,
        name: options.name,
        inputs,
        outputs,
        params,
        capacity: options.capacity ?? (() => ({})),
        counts,
        animated: options.animated === true,
        create: options.create,
        with(values: Readonly<Record<string, ExtensionParamValue>>): SetNodeUse {
            for (const k of Object.keys(values))
                if (!(k in params)) fail(`valor para parâmetro desconhecido '${k}'`);
            return Object.freeze({ definition, values: Object.freeze({ ...values }) });
        },
    });
    return definition;
}
