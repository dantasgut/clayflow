import {
    fieldAlign,
    fieldBytes,
    fieldCtor,
    fieldElementBytes,
    fieldElements,
    fieldWgsl,
    type FieldType,
} from './FieldType';
import { Schema } from './Schema';

interface StructFieldLayout {
    readonly name: string;
    readonly type: FieldType;
    readonly offset: number;
}

/** Atributo de vértice compacto: posição no vértice intercalado e formato WebGPU. */
export interface VertexAttributeLayout {
    readonly name: string;
    /** Bytes desde o início do vértice. */
    readonly offset: number;
    readonly format: GPUVertexFormat;
}

/** Layout de vértice intercalado sem alinhamento de struct (ex.: `vec3f` ocupa 12 bytes). */
export interface VertexLayout {
    /** Bytes por vértice (soma dos atributos). */
    readonly stride: number;
    /** Atributos na ordem declarada. */
    readonly attributes: readonly VertexAttributeLayout[];
}

const VERTEX_FORMATS: Partial<Record<FieldType, GPUVertexFormat>> = {
    f32: 'float32',
    vec2f: 'float32x2',
    vec3f: 'float32x3',
    vec4f: 'float32x4',
    u32: 'uint32',
    vec2u: 'uint32x2',
    vec3u: 'uint32x3',
    vec4u: 'uint32x4',
    i32: 'sint32',
    vec2i: 'sint32x2',
    vec3i: 'sint32x3',
    vec4i: 'sint32x4',
};

function alignTo(value: number, alignment: number): number {
    return Math.ceil(value / alignment) * alignment;
}

/**
 * StructSchema descreve um struct WGSL — sequência ordenada de fields
 * tipados (FieldType) com layout calculado automaticamente seguindo regras
 * de alinhamento WGSL std430-like. Resources usam StructSchema para:
 *   - Calcular `stride` (tamanho de 1 instância no buffer GPU).
 *   - Serializar `data` em ArrayBuffer (`pack(data)`) para core.write.
 *   - Gerar WGSL `struct` definition para uso em shaders (`toWGSL()`).
 *
 * Exemplo:
 * ```ts
 * const camera = new StructSchema('Camera', {
 *     view: FieldType.mat4x4f,
 *     position: FieldType.vec4f,
 *     near: FieldType.f32,
 * });
 * camera.stride;  // 80 (mat4 64 + vec4 16, alinhado a 16)
 * camera.pack({ view: identity, position: [0,0,5,1], near: 0.1 });
 * ```
 */
export class StructSchema extends Schema {
    /** Nome do struct (e.g. 'Camera', 'Transform'). Usado em queries e WGSL. */
    readonly name: string;
    /** Map ordenado field-name → FieldType. Ordem de inserção preservada. */
    readonly fields: ReadonlyMap<string, FieldType>;
    /** Tamanho total de uma instância em bytes (alinhado ao max field align). */
    readonly stride: number;
    private readonly layout: ReadonlyMap<string, StructFieldLayout>;
    private compactVertexLayout: VertexLayout | null = null;

    constructor(name: string, fields: Record<string, FieldType>) {
        super();
        this.name = name;
        const orderedFields = new Map<string, FieldType>();
        for (const [k, v] of Object.entries(fields)) orderedFields.set(k, v);
        this.fields = orderedFields;

        const layout = new Map<string, StructFieldLayout>();
        let offset = 0;
        for (const [fieldName, fieldType] of orderedFields) {
            offset = alignTo(offset, fieldAlign(fieldType));
            layout.set(fieldName, { name: fieldName, type: fieldType, offset });
            offset += fieldBytes(fieldType);
        }
        // struct align = max(field aligns), stride = align-up(struct size)
        let maxAlign = 4;
        for (const ft of orderedFields.values()) maxAlign = Math.max(maxAlign, fieldAlign(ft));
        this.stride = alignTo(offset, maxAlign);
        this.layout = layout;
    }

    /**
     * Byte offset do field dentro do struct. Útil para writes parciais
     * (`core.write(buf, data, offsetOf('position'))`). Lança se field não existe.
     */
    offsetOf(field: string): number {
        const entry = this.layout.get(field);
        if (entry === undefined)
            throw new Error(`StructSchema(${this.name}): unknown field '${field}'`);
        return entry.offset;
    }

    /**
     * Layout de vértice compacto deste schema: atributos na ordem declarada, sem o alinhamento de struct WGSL
     * (`vec3f` = 12 bytes), `stride` = soma — o formato dos vértices intercalados das geometrias (ex.:
     * `position vec3f, normal vec3f, uv vec2f` → stride 32). Lança se algum campo não é atributo de vértice
     * (matrizes, `u16`/`i16`).
     */
    get vertexLayout(): VertexLayout {
        if (this.compactVertexLayout !== null) return this.compactVertexLayout;
        const attributes: VertexAttributeLayout[] = [];
        let offset = 0;
        for (const [name, type] of this.fields) {
            const format = VERTEX_FORMATS[type];
            if (format === undefined) {
                throw new Error(
                    `StructSchema(${this.name}): campo '${name}' (${type}) não é atributo de vértice.`,
                );
            }
            attributes.push({ name, offset, format });
            offset += fieldElements(type) * fieldElementBytes(type);
        }
        this.compactVertexLayout = { stride: offset, attributes };
        return this.compactVertexLayout;
    }

    /** FieldType do field. Lança se field não existe. */
    typeOf(field: string): FieldType {
        const entry = this.layout.get(field);
        if (entry === undefined)
            throw new Error(`StructSchema(${this.name}): unknown field '${field}'`);
        return entry.type;
    }

    /**
     * Preenche values ausentes em `values` com defaults (0 ou [0,0,...]).
     * Usado nos constructors de Resources para garantir `data` completo.
     */
    applyDefaults(values: Record<string, unknown>): Record<string, unknown> {
        const out: Record<string, unknown> = {};
        for (const [name, type] of this.fields) {
            if (Object.prototype.hasOwnProperty.call(values, name)) {
                out[name] = values[name];
            } else {
                out[name] = defaultFor(type);
            }
        }
        return out;
    }

    /**
     * Serializa `data` em um ArrayBuffer com o stride exato do struct.
     * Cada field é escrito no offset correto com o TypedArray do tipo.
     * Returns Uint8Array view sobre o buffer (pronto para core.write).
     */
    pack(data: Record<string, unknown>): ArrayBufferView {
        const buffer = new ArrayBuffer(this.stride);
        for (const [name, layoutEntry] of this.layout) {
            const value = data[name];
            const ctor = fieldCtor(layoutEntry.type);
            const elements = fieldElements(layoutEntry.type);
            const elementBytes = fieldElementBytes(layoutEntry.type);
            const view = new ctor(buffer, layoutEntry.offset, elements);
            writeValue(view, value, layoutEntry.type, elements, elementBytes);
        }
        return new Uint8Array(buffer);
    }

    /**
     * Emite a definição WGSL `struct Name { ... }` correspondente.
     * Útil para concatenar em shader sources e garantir sincronia
     * com o layout JS (mesmo nome de field, mesmo tipo).
     */
    toWGSL(): string {
        const lines: string[] = [`struct ${this.name} {`];
        for (const [name, type] of this.fields) {
            lines.push(`    ${name}: ${fieldWgsl(type)},`);
        }
        lines.push('}');
        return lines.join('\n');
    }
}

function defaultFor(type: FieldType): number | number[] {
    const elements = fieldElements(type);
    if (elements === 1) return 0;
    return new Array(elements).fill(0);
}

function writeValue(
    view: { [i: number]: number; length: number },
    value: unknown,
    type: FieldType,
    elements: number,
    _elementBytes: number,
): void {
    if (typeof value === 'number') {
        view[0] = value;
        for (let i = 1; i < elements; i++) view[i] = 0;
        return;
    }
    if (Array.isArray(value)) {
        const limit = Math.min(elements, value.length);
        for (let i = 0; i < limit; i++) {
            const v = value[i];
            view[i] = typeof v === 'number' ? v : 0;
        }
        for (let i = limit; i < elements; i++) view[i] = 0;
        return;
    }
    if (value !== undefined && typeof value === 'object' && Symbol.iterator in value!) {
        let i = 0;
        for (const v of value as Iterable<unknown>) {
            if (i >= elements) break;
            view[i] = typeof v === 'number' ? v : 0;
            i++;
        }
        for (; i < elements; i++) view[i] = 0;
        return;
    }
    throw new Error(`StructSchema: cannot pack field of type ${type} from value ${typeof value}`);
}
