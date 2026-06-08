/**
 * Schema é a base abstrata de todos os layouts de dados GPU. Subclasses
 * concretas:
 *   - `StructSchema`: struct com fields nomeados e tipos primitivos.
 *   - `TensorSchema`: tensor N-dimensional para densidade/grid data.
 *
 * Todo Resource declara um (ou mais) Schemas via `getDescriptors()`. O
 * ResourceSystem usa Schema.stride para calcular byteSize do buffer e
 * Schema.pack para serializar `data` no upload.
 */
export abstract class Schema {
    /**
     * Nome do schema (e.g. 'Camera', 'Transform', 'BoxVertex'). Usado para
     * indexação em World.queryBySchemaName e como key em pool entries.
     */
    abstract readonly name: string;
    /** Tamanho de uma instância em bytes (já alinhado). */
    abstract readonly stride: number;

    /** Serializa `data` em ArrayBufferView com layout correto para o GPU. */
    abstract pack(data: Record<string, unknown>): ArrayBufferView;
    /** Gera struct WGSL correspondente — concatena no shader source. */
    abstract toWGSL(): string;
    /** Preenche values ausentes em `values` com defaults sensíveis. */
    abstract applyDefaults(values: Record<string, unknown>): Record<string, unknown>;
}
