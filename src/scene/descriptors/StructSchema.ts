import {
    type FieldType,
    fieldAlign,
    fieldBytes,
    fieldCtor,
    fieldElementBytes,
    fieldElements,
    fieldIsAtomic,
    fieldWgsl,
} from './FieldType';
import { Schema } from './Schema';

/** Array de tamanho fixo `array<E, N>`. */
export interface ArrayFieldSpec {
    /** Discriminador do campo composto. */
    readonly kind: 'array';
    /** Tipo de cada elemento. */
    readonly element: FieldSpec;
    /** Número de elementos (≥ 1). */
    readonly length: number;
}

/** Array de tamanho definido em execução `array<E>` — só como último campo e só em storage. */
export interface RuntimeArrayFieldSpec {
    /** Discriminador do campo composto. */
    readonly kind: 'runtimeArray';
    /** Tipo de cada elemento. */
    readonly element: FieldSpec;
}

/** Struct aninhado, pelo seu schema. */
export interface StructFieldSpec {
    /** Discriminador do campo composto. */
    readonly kind: 'struct';
    /** Schema do struct aninhado (entra nas dependências do schema que o contém). */
    readonly schema: StructSchema;
}

/** Tipo de um campo: primitivo (`FieldType`) ou composto. */
export type FieldSpec = FieldType | ArrayFieldSpec | RuntimeArrayFieldSpec | StructFieldSpec;

/** Campo `array<element, length>` de tamanho fixo. */
export function fieldArray(element: FieldSpec, length: number): ArrayFieldSpec {
    if (!Number.isInteger(length) || length < 1) {
        throw new RangeError(`fieldArray: length deve ser inteiro ≥ 1 (recebeu ${length})`);
    }
    return Object.freeze({ kind: 'array', element, length });
}

/** Campo `array<element>` de tamanho em execução (último campo de um schema de storage). */
export function fieldRuntimeArray(element: FieldSpec): RuntimeArrayFieldSpec {
    return Object.freeze({ kind: 'runtimeArray', element });
}

/** Campo de struct aninhado. */
export function fieldStruct(schema: StructSchema): StructFieldSpec {
    return Object.freeze({ kind: 'struct', schema });
}

/** Espaço de endereço cujas regras de layout o schema segue. */
export type AddressSpace = 'storage' | 'uniform';

/** Opções do `StructSchema`. */
export interface StructSchemaOptions {
    /** Nome do struct no WGSL (default: `name`, que continua sendo o pool key). */
    readonly wgslName?: string;
    /** Regras de layout (default `storage`; `uniform` arredonda alinhamentos de arrays e structs aninhados a 16). */
    readonly addressSpace?: AddressSpace;
}

interface StructFieldLayout {
    readonly name: string;
    readonly type: FieldSpec;
    readonly offset: number;
    /** Atributos WGSL de layout emitidos no campo (uniform: `@align(16)`, `@size(n)`). */
    readonly attributes: string;
}

/** Atributo de vértice compacto: posição no vértice intercalado e formato WebGPU. */
export interface VertexAttributeLayout {
    /** Nome do campo no schema. */
    readonly name: string;
    /** Bytes desde o início do vértice. */
    readonly offset: number;
    /** Formato do atributo no WebGPU (ex.: `'float32x3'`). */
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

const WGSL_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const WGSL_RESERVED: ReadonlySet<string> = new Set([
    'struct',
    'fn',
    'var',
    'let',
    'const',
    'override',
    'alias',
    'array',
    'atomic',
    'ptr',
    'true',
    'false',
    'if',
    'else',
    'for',
    'loop',
    'while',
    'return',
    'bool',
    'f32',
    'f16',
    'i32',
    'u32',
]);

function alignTo(value: number, alignment: number): number {
    return Math.ceil(value / alignment) * alignment;
}

function isPrimitive(t: FieldSpec): t is FieldType {
    return typeof t === 'string';
}

/** Alinhamento e tamanho de um tipo pelas regras do espaço de endereço. */
function typeLayout(t: FieldSpec, space: AddressSpace): { align: number; size: number } {
    if (isPrimitive(t)) return { align: fieldAlign(t), size: fieldBytes(t) };
    if (t.kind === 'struct') {
        const s = t.schema;
        return space === 'uniform'
            ? { align: alignTo(s.align, 16), size: alignTo(s.stride, 16) }
            : { align: s.align, size: s.stride };
    }
    const elem = typeLayout(t.element, space);
    const stride = alignTo(elem.size, elem.align);
    if (t.kind === 'runtimeArray') return { align: elem.align, size: 0 };
    return { align: elem.align, size: stride * t.length };
}

/** Nome WGSL de um tipo. */
function typeWgsl(t: FieldSpec): string {
    if (isPrimitive(t)) return fieldWgsl(t);
    if (t.kind === 'struct') return t.schema.wgslName;
    if (t.kind === 'runtimeArray') return `array<${typeWgsl(t.element)}>`;
    return `array<${typeWgsl(t.element)}, ${t.length}>`;
}

/** Valor padrão de um campo (0, vetor de zeros, array de padrões, objeto do struct aninhado). */
function defaultFor(t: FieldSpec): unknown {
    if (isPrimitive(t)) {
        const n = fieldElements(t);
        return n === 1 ? 0 : new Array(n).fill(0);
    }
    if (t.kind === 'struct') return t.schema.applyDefaults({});
    if (t.kind === 'runtimeArray') return [];
    return Array.from({ length: t.length }, () => defaultFor(t.element));
}

/** Schemas aninhados (diretos e transitivos), na ordem de primeira ocorrência — dependências do struct no WGSL. */
function nestedSchemas(t: FieldSpec, out: StructSchema[]): void {
    if (isPrimitive(t)) return;
    if (t.kind === 'struct') {
        for (const inner of t.schema.dependencies) if (!out.includes(inner)) out.push(inner);
        if (!out.includes(t.schema)) out.push(t.schema);
        return;
    }
    nestedSchemas(t.element, out);
}

/**
 * StructSchema descreve um struct WGSL — sequência ordenada de campos tipados com layout calculado pelas regras de
 * layout do WGSL para o espaço de endereço (`storage` ou `uniform`). É a fonte única do layout de um dado de GPU:
 *   - `stride`/`offsetOf` (tamanho e posição dos campos no buffer);
 *   - `pack`/`packInto` (serialização de `data`);
 *   - `toWGSL()` (o struct WGSL correspondente, com `wgslName`, inclusive atributos de layout quando necessário);
 *   - `vertexLayout` (vértices intercalados compactos das geometrias).
 * Os três usam o mesmo layout, então empacotamento e WGSL concordam por construção.
 *
 * Exemplo:
 * ```ts
 * const camera = new StructSchema('Camera', {
 *     view: FieldType.mat4x4f,
 *     position: FieldType.vec4f,
 *     near: FieldType.f32,
 * });
 * camera.stride;  // 96 (mat4 64 + vec4 16 + f32 4, alinhado a 16)
 * camera.pack({ view: identity, position: [0,0,5,1], near: 0.1 });
 * ```
 */
export class StructSchema extends Schema {
    /** Nome do schema (pool key; também usado em queries). */
    readonly name: string;
    /** Nome do struct no WGSL. */
    readonly wgslName: string;
    /** Regras de layout seguidas. */
    readonly addressSpace: AddressSpace;
    /** Map ordenado nome do campo → tipo. Ordem de inserção preservada. */
    readonly fields: ReadonlyMap<string, FieldSpec>;
    /** Tamanho de uma instância em bytes (alinhado ao maior alinhamento; sem o array em execução, se houver). */
    readonly stride: number;
    /** Alinhamento do struct (maior alinhamento entre os campos, mínimo 4). */
    readonly align: number;
    /** Schemas dos structs aninhados (transitivos), em ordem de dependência. */
    readonly dependencies: readonly StructSchema[];
    private readonly layout: ReadonlyMap<string, StructFieldLayout>;
    /** Passos de empacotamento (offset em palavras, componentes, vista), calculados na primeira chamada. */
    private packSteps: readonly PackStep[] | undefined;
    private compactVertexLayout: VertexLayout | null = null;

    constructor(
        name: string,
        fields: Record<string, FieldSpec>,
        options: StructSchemaOptions = {},
    ) {
        super();
        this.name = name;
        this.wgslName = options.wgslName ?? name;
        this.addressSpace = options.addressSpace ?? 'storage';
        if (!WGSL_IDENT.test(this.wgslName) || WGSL_RESERVED.has(this.wgslName)) {
            throw new TypeError(
                `StructSchema(${name}): wgslName '${this.wgslName}' não é identificador WGSL válido`,
            );
        }
        const ordered = new Map<string, FieldSpec>(Object.entries(fields));
        this.fields = ordered;
        const names = [...ordered.keys()];

        const layout = new Map<string, StructFieldLayout>();
        const deps: StructSchema[] = [];
        let offset = 0;
        let maxAlign = 4;
        names.forEach((fieldName, index) => {
            const type = ordered.get(fieldName)!;
            this.validateField(fieldName, type, index === names.length - 1);
            nestedSchemas(type, deps);
            const { align, size } = typeLayout(type, this.addressSpace);
            offset = alignTo(offset, align);
            // Em uniform, structs aninhados exigem @align(16)/@size múltiplo de 16 (regra do WGSL): emitidos no campo.
            const attributes =
                this.addressSpace === 'uniform' && !isPrimitive(type) && type.kind === 'struct'
                    ? `@align(${align}) @size(${size}) `
                    : '';
            layout.set(fieldName, { name: fieldName, type, offset, attributes });
            offset += size;
            maxAlign = Math.max(maxAlign, align);
        });
        this.align = maxAlign;
        this.stride = alignTo(offset, maxAlign);
        this.layout = layout;
        this.dependencies = deps;
    }

    private validateField(fieldName: string, type: FieldSpec, last: boolean): void {
        const where = `StructSchema(${this.name}): campo '${fieldName}'`;
        if (!WGSL_IDENT.test(fieldName) || WGSL_RESERVED.has(fieldName)) {
            throw new TypeError(`${where} não é identificador WGSL válido`);
        }
        const uniform = this.addressSpace === 'uniform';
        const check = (t: FieldSpec, top: boolean): void => {
            if (isPrimitive(t)) {
                if (uniform && fieldIsAtomic(t))
                    throw new TypeError(`${where}: atômicos só existem em storage`);
                return;
            }
            if (t.kind === 'struct') {
                if (uniform && t.schema.addressSpace !== 'uniform') {
                    throw new TypeError(
                        `${where}: struct aninhado '${t.schema.name}' precisa ser de uniform`,
                    );
                }
                return;
            }
            if (t.kind === 'runtimeArray') {
                if (uniform)
                    throw new TypeError(
                        `${where}: array de tamanho em execução só existe em storage`,
                    );
                if (!top || !last)
                    throw new TypeError(
                        `${where}: array de tamanho em execução só como último campo`,
                    );
                check(t.element, false);
                return;
            }
            if (uniform && typeLayout(t.element, 'uniform').align % 16 !== 0) {
                throw new TypeError(
                    `${where}: em uniform o elemento de array precisa ter alinhamento 16 (use vec4/struct de uniform)`,
                );
            }
            check(t.element, false);
        };
        check(type, true);
    }

    /**
     * Byte offset do campo dentro do struct. Útil para writes parciais e leitura de volta. Lança se o campo não existe.
     */
    offsetOf(field: string): number {
        return this.entry(field).offset;
    }

    /** Tipo do campo. Lança se o campo não existe. */
    typeOf(field: string): FieldSpec {
        return this.entry(field).type;
    }

    private entry(field: string): StructFieldLayout {
        const entry = this.layout.get(field);
        if (entry === undefined)
            throw new Error(`StructSchema(${this.name}): unknown field '${field}'`);
        return entry;
    }

    /**
     * Layout de vértice compacto deste schema: atributos na ordem declarada, sem o alinhamento de struct WGSL
     * (`vec3f` = 12 bytes), `stride` = soma — o formato dos vértices intercalados das geometrias (ex.:
     * `position vec3f, normal vec3f, uv vec2f` → stride 32). Lança se algum campo não é atributo de vértice
     * (matrizes, atômicos, tipos compostos).
     */
    get vertexLayout(): VertexLayout {
        if (this.compactVertexLayout !== null) return this.compactVertexLayout;
        const attributes: VertexAttributeLayout[] = [];
        let offset = 0;
        for (const [name, type] of this.fields) {
            const format = isPrimitive(type) ? VERTEX_FORMATS[type] : undefined;
            if (format === undefined || !isPrimitive(type)) {
                throw new Error(
                    `StructSchema(${this.name}): campo '${name}' (${typeWgsl(type)}) não é atributo de vértice.`,
                );
            }
            attributes.push({ name, offset, format });
            offset += fieldElements(type) * fieldElementBytes(type);
        }
        this.compactVertexLayout = { stride: offset, attributes };
        return this.compactVertexLayout;
    }

    /**
     * Preenche values ausentes em `values` com defaults (0, vetor de zeros, arrays e structs aninhados com os seus
     * padrões). Usado nos constructors de Resources para garantir `data` completo.
     */
    applyDefaults(values: Record<string, unknown>): Record<string, unknown> {
        const out: Record<string, unknown> = {};
        for (const [name, type] of this.fields) {
            out[name] = Object.prototype.hasOwnProperty.call(values, name)
                ? values[name]
                : defaultFor(type);
        }
        return out;
    }

    /**
     * Serializa `data` num buffer novo com o stride exato do struct (padding zerado). Returns Uint8Array view sobre o
     * buffer (pronto para core.write).
     */
    pack(data: Record<string, unknown>): Uint8Array {
        const buffer = new ArrayBuffer(this.stride);
        this.packInto(buffer, 0, data);
        return new Uint8Array(buffer);
    }

    /**
     * Serializa `data` em `target` a partir de `byteOffset`, sem alocar: escreve exatamente `stride` bytes (padding
     * zerado). Campos atômicos recebem o valor inicial como u32/i32; arrays aceitam arrays de números ou de objetos
     * (structs aninhados).
     */
    packInto(
        target: ArrayBuffer | ArrayBufferView,
        byteOffset: number,
        data: Record<string, unknown>,
    ): void {
        const buffer = target instanceof ArrayBuffer ? target : (target.buffer as ArrayBuffer);
        const base = (target instanceof ArrayBuffer ? 0 : target.byteOffset) + byteOffset;
        if (base % 4 !== 0)
            throw new RangeError(
                `StructSchema(${this.name}): byteOffset ${byteOffset} não alinhado a 4`,
            );
        const views = viewsOf(buffer);
        const word = base >>> 2;
        views.u32.fill(0, word, (base + this.stride) >>> 2);
        this.packSteps ??= [...this.layout].map(([name, entry]) => packStep(name, entry));
        for (const step of this.packSteps) {
            const value = data[step.name];
            if (value === undefined) continue;
            if (step.view === undefined) {
                writeField(views, buffer, base + step.offset, step.type, value, this);
                continue;
            }
            const view = views[step.view];
            const at = word + (step.offset >>> 2);
            if (typeof value === 'number') view[at] = value;
            else if (Array.isArray(value) || ArrayBuffer.isView(value)) {
                const source = value as ArrayLike<unknown>;
                const n = source.length < step.elements ? source.length : step.elements;
                for (let i = 0; i < n; i++) {
                    const v = source[i];
                    view[at + i] = typeof v === 'number' ? v : 0;
                }
            } else writeField(views, buffer, base + step.offset, step.type, value, this);
        }
    }

    /**
     * Serializa os registros `start..start+count` de um dado por campo (SoA: cada campo primitivo é um array com
     * `fieldElements(tipo)` números por registro, no layout do buffer — matrizes com o padding das colunas; campos
     * compostos são arrays com um valor por registro) em AoS, no layout do `array<T>` do WGSL (spec 008, faixas de
     * pool). Campo ausente fica com zero, como em `pack`.
     * @throws RangeError se um campo tem menos valores que `start + count` registros.
     */
    packRange(soa: Record<string, unknown>, start: number, count: number): Uint8Array {
        const buffer = new ArrayBuffer(this.stride * count);
        this.packRangeInto(buffer, 0, soa, start, count);
        return new Uint8Array(buffer);
    }

    /** `packRange` em `target` a partir de `byteOffset`, sem alocar o destino. */
    packRangeInto(
        target: ArrayBuffer | ArrayBufferView,
        byteOffset: number,
        soa: Record<string, unknown>,
        start: number,
        count: number,
    ): void {
        this.packSteps ??= [...this.layout].map(([name, entry]) => packStep(name, entry));
        const record: Record<string, unknown> = {};
        const sources: { step: PackStep; values: ArrayLike<unknown>; slice: number[] }[] = [];
        for (const step of this.packSteps) {
            const values = soa[step.name];
            if (values === undefined) continue;
            if (!Array.isArray(values) && !ArrayBuffer.isView(values)) {
                throw new TypeError(
                    `StructSchema(${this.name}): o campo '${step.name}' de uma faixa deve ser um array (um valor por registro).`,
                );
            }
            const list = values as ArrayLike<unknown>;
            const per = step.view === undefined ? 1 : step.elements;
            if (list.length < (start + count) * per) {
                throw new RangeError(
                    `StructSchema(${this.name}): o campo '${step.name}' tem ${list.length} valores; a faixa `
                        + `${start}..${start + count} pede ${(start + count) * per}.`,
                );
            }
            sources.push({ step, values: list, slice: new Array<number>(per) });
        }
        for (let i = 0; i < count; i++) {
            const index = start + i;
            for (const { step, values, slice } of sources) {
                if (step.view === undefined) {
                    record[step.name] = values[index];
                    continue;
                }
                const base = index * slice.length;
                for (let k = 0; k < slice.length; k++) {
                    const v = values[base + k];
                    slice[k] = typeof v === 'number' ? v : 0;
                }
                record[step.name] = slice.length === 1 ? slice[0] : slice;
            }
            this.packInto(target, byteOffset + i * this.stride, record);
        }
    }

    /**
     * Lê `count` registros de `source` a partir de `byteOffset` como dado por campo (SoA) — o inverso de `packRange`:
     * campos primitivos viram arrays tipados com `fieldElements(tipo)` números por registro; compostos, arrays com um
     * valor por registro.
     */
    unpackRange(
        source: ArrayBuffer | ArrayBufferView,
        count: number,
        byteOffset = 0,
    ): Record<string, unknown> {
        const out: Record<string, unknown> = {};
        const buffer = source instanceof ArrayBuffer ? source : (source.buffer as ArrayBuffer);
        const base = (source instanceof ArrayBuffer ? 0 : source.byteOffset) + byteOffset;
        for (const [name, entry] of this.layout) {
            const type = entry.type;
            if (!isPrimitive(type)) {
                const list: unknown[] = [];
                for (let i = 0; i < count; i++)
                    list.push(readField(buffer, base + i * this.stride + entry.offset, type, this));
                out[name] = list;
                continue;
            }
            const per = fieldElements(type);
            const Ctor = fieldCtor(type);
            const values = new Ctor(per * count);
            for (let i = 0; i < count; i++) {
                const at = (base + i * this.stride + entry.offset) >>> 2;
                const view = new Ctor(buffer, at * 4, per);
                values.set(view, i * per);
            }
            out[name] = values;
        }
        return out;
    }

    /**
     * Lê um registro de `source` a partir de `byteOffset` — o inverso de `packInto`: escalares viram números; vetores,
     * matrizes e arrays de tamanho fixo viram arrays de números (matrizes com o padding das colunas, como no buffer);
     * structs aninhados viram objetos. Arrays de tamanho em execução não são lidos.
     */
    unpack(source: ArrayBuffer | ArrayBufferView, byteOffset = 0): Record<string, unknown> {
        const buffer = source instanceof ArrayBuffer ? source : (source.buffer as ArrayBuffer);
        const base = (source instanceof ArrayBuffer ? 0 : source.byteOffset) + byteOffset;
        const out: Record<string, unknown> = {};
        for (const [name, entry] of this.layout) {
            const value = readField(buffer, base + entry.offset, entry.type, this);
            if (value !== undefined) out[name] = value;
        }
        return out;
    }

    /**
     * Emite a definição WGSL `struct <wgslName> { ... }` (só deste struct; os aninhados são emitidos pela montagem a
     * partir de `dependencies`).
     */
    toWGSL(): string {
        const lines = [`struct ${this.wgslName} {`];
        for (const [name, entry] of this.layout) {
            lines.push(`    ${entry.attributes}${name}: ${typeWgsl(entry.type)},`);
        }
        lines.push('}');
        return lines.join('\n');
    }
}

/** Passo de empacotamento de um campo: primitivo (vista e componentes) ou composto (`view` ausente → `writeField`). */
interface PackStep {
    readonly name: string;
    readonly offset: number;
    readonly type: FieldSpec;
    readonly view: 'f32' | 'i32' | 'u32' | undefined;
    readonly elements: number;
}

function packStep(name: string, entry: StructFieldLayout): PackStep {
    const type = entry.type;
    if (!isPrimitive(type))
        return { name, offset: entry.offset, type, view: undefined, elements: 0 };
    const ctor = fieldCtor(type);
    const view = ctor === Float32Array ? 'f32' : ctor === Int32Array ? 'i32' : 'u32';
    return { name, offset: entry.offset, type, view, elements: fieldElements(type) };
}

/** Vistas de 32 bits de um `ArrayBuffer` inteiro (todos os campos têm componentes de 4 bytes). */
interface WordViews {
    readonly f32: Float32Array;
    readonly i32: Int32Array;
    readonly u32: Uint32Array;
}

/** Vistas por buffer, reaproveitadas: empacotar não aloca uma vista por campo. */
const wordViews = new WeakMap<ArrayBufferLike, WordViews>();

function viewsOf(buffer: ArrayBuffer): WordViews {
    let views = wordViews.get(buffer);
    if (views === undefined) {
        const words = buffer.byteLength >>> 2;
        views = {
            f32: new Float32Array(buffer, 0, words),
            i32: new Int32Array(buffer, 0, words),
            u32: new Uint32Array(buffer, 0, words),
        };
        wordViews.set(buffer, views);
    }
    return views;
}

function writeField(
    views: WordViews,
    buffer: ArrayBuffer,
    offset: number,
    type: FieldSpec,
    value: unknown,
    owner: StructSchema,
): void {
    if (value === undefined) return;
    if (isPrimitive(type)) {
        writePrimitive(views, offset, type, value, owner);
        return;
    }
    if (type.kind === 'struct') {
        if (typeof value !== 'object' || value === null) {
            throw new Error(
                `StructSchema(${owner.name}): struct '${type.schema.name}' espera objeto`,
            );
        }
        type.schema.packInto(buffer, offset, value as Record<string, unknown>);
        return;
    }
    if (!Array.isArray(value))
        throw new Error(`StructSchema(${owner.name}): array espera um array de valores`);
    if (type.kind === 'runtimeArray') {
        throw new Error(
            `StructSchema(${owner.name}): array de tamanho em execução não é empacotado pelo schema`,
        );
    }
    const elem = typeLayout(type.element, owner.addressSpace);
    const stride = alignTo(elem.size, elem.align);
    const n = Math.min(type.length, value.length);
    for (let i = 0; i < n; i++)
        writeField(views, buffer, offset + i * stride, type.element, value[i], owner);
}

function readField(
    buffer: ArrayBuffer,
    offset: number,
    type: FieldSpec,
    owner: StructSchema,
): unknown {
    if (isPrimitive(type)) {
        const elements = fieldElements(type);
        const view = new (fieldCtor(type))(buffer, offset, elements);
        return elements === 1 ? view[0] : Array.from(view);
    }
    if (type.kind === 'struct') return type.schema.unpack(buffer, offset);
    if (type.kind === 'runtimeArray') return undefined;
    const elem = typeLayout(type.element, owner.addressSpace);
    const stride = alignTo(elem.size, elem.align);
    return Array.from({ length: type.length }, (_, i) =>
        readField(buffer, offset + i * stride, type.element, owner),
    );
}

function writePrimitive(
    views: WordViews,
    offset: number,
    type: FieldType,
    value: unknown,
    owner: StructSchema,
): void {
    const elements = fieldElements(type);
    const ctor = fieldCtor(type);
    const view = ctor === Float32Array ? views.f32 : ctor === Int32Array ? views.i32 : views.u32;
    const at = offset >>> 2;
    if (typeof value === 'number') {
        view[at] = value;
        return;
    }
    if (Array.isArray(value) || ArrayBuffer.isView(value)) {
        const source = value as ArrayLike<unknown>;
        const n = Math.min(elements, source.length);
        for (let i = 0; i < n; i++) {
            const v = source[i];
            view[at + i] = typeof v === 'number' ? v : 0;
        }
        return;
    }
    if (value !== null && typeof value === 'object' && Symbol.iterator in value) {
        let i = 0;
        for (const v of value as Iterable<unknown>) {
            if (i >= elements) break;
            view[at + i++] = typeof v === 'number' ? v : 0;
        }
        return;
    }
    throw new Error(
        `StructSchema(${owner.name}): cannot pack field of type ${type} from value ${typeof value}`,
    );
}
