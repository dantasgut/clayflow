import { Entity } from '../contracts/Entity';
import type { ExtensionParamsData } from '../contracts/ExtensionFunction';
import type { ExtensionParamType, ExtensionParamValue } from '../contracts/ExtensionParams';
import { paramSlots, paramValues, type ParamSlot } from '../contracts/ParamRecord';
import type { Resource } from '../contracts/Resource';
import { ResourceState } from '../contracts/ResourceState';
import { extensionRecordSchema } from '../descriptors/ExtensionRecord';
import type { GPUDescriptor } from '../descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../descriptors/PipelineDescriptor';
import type { NodeGraph } from './NodeGraph';
import { NodeGraphError } from './NodeGraphError';

/** Registro dos valores de um grafo de conjunto (pool `SetGraphRecord`). */
const SetGraphRecordSchema = extensionRecordSchema('SetGraphRecord');

/** Opções de `SetGraph`. */
export interface SetGraphOptions {
    /** O grafo: nós de conjunto (e nós de ponto ligados às entradas de ponto deles). */
    readonly graph: NodeGraph;
    /** Valores iniciais por cima dos do grafo (`nó_parâmetro`). */
    readonly values?: Readonly<Record<string, ExtensionParamValue>>;
}

/**
 * Grafo de nós de conjunto como Resource (spec 031, US3): o grafo e os valores dos parâmetros de todos os nós
 * (`values['nó_parâmetro']`, no registro do pool `SetGraphRecord` — mudar um valor envia o registro e o `GraphFlow`
 * refaz o grafo no quadro seguinte, sem recompilar). `setGraph` troca a topologia (revisão +1: o `GraphFlow` recria os
 * nós). Na entidade, ao lado do Resource alvo (ex.: a `GraphGeometry` que o nó de saída escreve), do material e do
 * `Transform`.
 */
export class SetGraph extends Entity<ExtensionParamsData> implements Resource {
    /** Registro dos valores (um pool para todos os grafos de conjunto). */
    static readonly schema = SetGraphRecordSchema;

    state: ResourceState = ResourceState.Uninitialized;
    #graph: NodeGraph;
    #params: Readonly<Record<string, ExtensionParamType>>;
    #slots: readonly ParamSlot[];
    #values: Record<string, ExtensionParamValue>;

    constructor(options: SetGraphOptions) {
        super();
        SetGraph.#validate(options.graph);
        this.#graph = options.graph;
        this.#params = Object.freeze({ ...options.graph.allParams() });
        this.#slots = paramSlots('SetGraph', this.#params);
        const data = SetGraphRecordSchema.applyDefaults({}) as unknown as ExtensionParamsData;
        for (let k = 0; k < 8; k++)
            (data as unknown as Record<string, number[]>)[`v${k}`] = [0, 0, 0, 0];
        this.data = data;
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
        const params = Object.freeze({ ...graph.allParams() });
        const slots = paramSlots('SetGraph', params);
        const kept: Record<string, ExtensionParamValue> = {};
        for (const [name, type] of Object.entries(params))
            if (this.#params[name] === type) kept[name] = this.#values[name]!;
        this.#graph = graph;
        this.#params = params;
        this.#slots = slots;
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

    #accessor(): Record<string, ExtensionParamValue> {
        return paramValues(
            'SetGraph',
            this.#slots,
            () => this.rawData as unknown as Record<string, number[]>,
            (v, row) => {
                (this.data as unknown as Record<string, number[]>)[`v${v}`] = row;
            },
        );
    }
}
