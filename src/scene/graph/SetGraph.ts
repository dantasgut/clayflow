import { Entity } from '../contracts/Entity';
import type { ExtensionParamType, ExtensionParamValue } from '../contracts/ExtensionParams';
import { paramFields, paramValues } from '../contracts/ParamRecord';
import type { Resource } from '../contracts/Resource';
import { ResourceState } from '../contracts/ResourceState';
import { FieldType } from '../descriptors/FieldType';
import type { GPUDescriptor } from '../descriptors/GPUDescriptor';
import { StructSchema } from '../descriptors/StructSchema';
import type { PipelineDescriptor } from '../descriptors/PipelineDescriptor';
import type { NodeGraph } from './NodeGraph';
import { NodeGraphError } from './NodeGraphError';

/**
 * Registro de um grafo de conjunto (pool `SetGraphRecord`, schema fixo): a revisão da topologia e a contagem de
 * escritas de valores. Os valores ficam no Resource (o `GraphFlow` os lê por nó e os põe nos uniforms dos nós); o
 * registro é o que a C2 envia quando eles mudam — o `poolWritten` que deixa o grafo `stale`.
 */
const SetGraphRecordSchema = new StructSchema('SetGraphRecord', {
    revision: FieldType.u32,
    writes: FieldType.u32,
});

/** Dado de um `SetGraph` (layout de `SetGraph.schema`). */
export interface SetGraphData {
    /** Revisão da topologia (sobe a cada `setGraph`). */
    revision: number;
    /** Escritas de valores (sobe a cada valor escrito). */
    writes: number;
}

/** Opções de `SetGraph`. */
export interface SetGraphOptions {
    /** O grafo: nós de conjunto (e nós de ponto ligados às entradas de ponto deles). */
    readonly graph: NodeGraph;
    /** Valores iniciais por cima dos do grafo (`nó_parâmetro`). */
    readonly values?: Readonly<Record<string, ExtensionParamValue>>;
}

/**
 * Grafo de nós de conjunto como Resource (spec 031, US3): o grafo e os valores dos parâmetros de todos os nós
 * (`values['nó_parâmetro']`, sem teto; mudar um valor envia o registro do pool `SetGraphRecord` e o `GraphFlow` refaz o
 * grafo no quadro seguinte, sem recompilar). `setGraph` troca a topologia (revisão +1: o `GraphFlow` recria os
 * nós). Na entidade, ao lado do Resource alvo (ex.: a `GraphGeometry` que o nó de saída escreve), do material e do
 * `Transform`.
 */
export class SetGraph extends Entity<SetGraphData> implements Resource {
    /** Registro dos valores (um pool para todos os grafos de conjunto). */
    static readonly schema = SetGraphRecordSchema;

    state: ResourceState = ResourceState.Uninitialized;
    #graph: NodeGraph;
    #params: Readonly<Record<string, ExtensionParamType>>;
    /** Valores atuais, por `nó_parâmetro`. */
    #store: Record<string, number | number[]> = {};
    #values: Record<string, ExtensionParamValue>;

    constructor(options: SetGraphOptions) {
        super();
        SetGraph.#validate(options.graph);
        this.#graph = options.graph;
        this.#params = SetGraph.#checked(options.graph);
        this.#store = SetGraph.#zeros(this.#params);
        this.data = { revision: 0, writes: 0 };
        this.#values = this.#accessor();
        this.#assign({ ...options.graph.allValues(), ...(options.values ?? {}) });
    }

    /** O grafo atual. */
    get graph(): NodeGraph {
        return this.#graph;
    }

    /** Parâmetros de todos os nós (`nó_parâmetro` → tipo). */
    get params(): Readonly<Record<string, ExtensionParamType>> {
        return this.#params;
    }

    /** Valores por `nó_parâmetro` (leitura e escrita; escrever refaz o grafo no quadro seguinte). */
    get values(): Record<string, ExtensionParamValue> {
        return this.#values;
    }

    /** Revisão da topologia (sobe a cada `setGraph`). */
    get revision(): number {
        return this.rawData.revision;
    }

    /** Valores atuais do nó `id` (pelo nome do parâmetro). */
    valuesOf(id: string): Readonly<Record<string, ExtensionParamValue>> {
        const prefix = `${id}_`;
        const out: Record<string, ExtensionParamValue> = {};
        for (const name of Object.keys(this.#params))
            if (name.startsWith(prefix)) out[name.slice(prefix.length)] = this.#values[name]!;
        return out;
    }

    /**
     * Troca o grafo (topologia nova): valida na hora (lança e o anterior continua); valores de mesmo nome e tipo são
     * mantidos, os novos recebem os do grafo; a revisão sobe.
     */
    setGraph(graph: NodeGraph): void {
        SetGraph.#validate(graph);
        const params = SetGraph.#checked(graph);
        const kept: Record<string, ExtensionParamValue> = {};
        for (const [name, type] of Object.entries(params))
            if (this.#params[name] === type) kept[name] = this.#values[name]!;
        this.#graph = graph;
        this.#params = params;
        this.#store = SetGraph.#zeros(params);
        this.#values = this.#accessor();
        this.#assign({ ...graph.allValues(), ...kept });
        this.data.revision = this.rawData.revision + 1;
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            { id: 'params', role: 'storage-ro', schema: SetGraphRecordSchema, storage: 'pool' },
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }

    /** Grafo de conjunto: ao menos um nó de conjunto e sem saída de ponto. */
    static #validate(graph: NodeGraph): void {
        if (graph.setOrder().length === 0)
            throw new NodeGraphError('target', 'SetGraph: o grafo não tem nó de conjunto', []);
        if (graph.output !== undefined)
            throw new NodeGraphError(
                'target',
                `SetGraph: grafo de conjunto sem 'output' (recebeu '${graph.output}')`,
                [graph.output],
            );
    }

    #assign(values: Readonly<Record<string, ExtensionParamValue>>): void {
        for (const [name, value] of Object.entries(values)) {
            if (!(name in this.#params))
                throw new TypeError(`SetGraph: valor para parâmetro desconhecido '${name}'`);
            this.#values[name] = value;
        }
    }

    /** Parâmetros do grafo (nomes e tipos validados). */
    static #checked(graph: NodeGraph): Readonly<Record<string, ExtensionParamType>> {
        const params = Object.freeze({ ...graph.allParams() });
        paramFields('SetGraph', params);
        return params;
    }

    /** Valores zerados dos parâmetros (escalar 0; vetor `vecN` com N zeros). */
    static #zeros(
        params: Readonly<Record<string, ExtensionParamType>>,
    ): Record<string, number | number[]> {
        const out: Record<string, number | number[]> = {};
        for (const [name, type] of Object.entries(params))
            out[name] = type.startsWith('vec') ? new Array<number>(Number(type[3])).fill(0) : 0;
        return out;
    }

    #accessor(): Record<string, ExtensionParamValue> {
        return paramValues(
            'SetGraph',
            this.#params,
            (name) => this.#store[name],
            (name, value) => {
                this.#store[name] = value;
                this.data.writes = this.rawData.writes + 1;
            },
        );
    }
}
