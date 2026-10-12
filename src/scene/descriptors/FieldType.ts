/**
 * FieldType enumera os tipos primitivos suportados em StructSchema. Os
 * valores correspondem aos nomes WGSL exatos (f32, vec3f, mat4x4f, etc.)
 * para preservar mapeamento direto JS ↔ shader.
 *
 * O StructSchema usa estes tipos para calcular layout (size + align) pelas
 * regras de layout do WGSL, gerar TypedArrays correspondentes, e emitir
 * WGSL struct definitions sincronizadas com a memória JS. Todos são
 * host-shareable (não há tipo de 16 bits: o WGSL não tem `u16`/`i16`).
 */
export enum FieldType {
    /** float32 — 4 bytes, align 4. */
    f32 = 'f32',
    /** vec2 de f32 — 8 bytes, align 8. */
    vec2f = 'vec2f',
    /** vec3 de f32 — 12 bytes, align 16 (WGSL padding). */
    vec3f = 'vec3f',
    /** vec4 de f32 — 16 bytes, align 16. */
    vec4f = 'vec4f',
    /** mat3x3 de f32 — 48 bytes (3×16), align 16. Cada coluna ocupa 16 bytes. */
    mat3x3f = 'mat3x3f',
    /** mat4x4 de f32 — 64 bytes, align 16. */
    mat4x4f = 'mat4x4f',
    /** uint32 — 4 bytes, align 4. */
    u32 = 'u32',
    /** vec2 de u32 — 8 bytes, align 8. */
    vec2u = 'vec2u',
    /** vec3 de u32 — 12 bytes, align 16. */
    vec3u = 'vec3u',
    /** vec4 de u32 — 16 bytes, align 16. */
    vec4u = 'vec4u',
    /** int32 — 4 bytes, align 4. */
    i32 = 'i32',
    /** vec2 de i32 — 8 bytes, align 8. */
    vec2i = 'vec2i',
    /** vec3 de i32 — 12 bytes, align 16. */
    vec3i = 'vec3i',
    /** vec4 de i32 — 16 bytes, align 16. */
    vec4i = 'vec4i',
    /** `atomic<u32>` — 4 bytes, align 4. Só em storage (contadores, somas em ponto fixo). */
    atomicU32 = 'atomicU32',
    /** `atomic<i32>` — 4 bytes, align 4. Só em storage. */
    atomicI32 = 'atomicI32',
}

/**
 * Constructors de TypedArray correspondentes aos FieldType. Usado por
 * StructSchema.pack() para alocar buffer contíguo do tipo certo.
 */
export type TypedArrayCtor =
    | Float32ArrayConstructor
    | Uint32ArrayConstructor
    | Int32ArrayConstructor;

/**
 * Metadados estáticos de cada FieldType — internal lookup table.
 * Exposto via funções `field*(t)` ao invés de objeto direto.
 */
interface FieldInfo {
    /** Tamanho do field em bytes (incluindo padding interno em vec3 = 12). */
    readonly bytes: number;
    /** Alinhamento WGSL (vec3 alinha em 16 mesmo ocupando 12 bytes). */
    readonly align: number;
    /** Número de elementos primitivos (f32 = 1, vec3f = 3, mat4x4f = 16). */
    readonly elements: number;
    /** Bytes por elemento primitivo (4 para f32/u32/i32). */
    readonly elementBytes: number;
    /** Constructor do TypedArray para serializar este tipo. */
    readonly ctor: TypedArrayCtor;
    /** Nome WGSL na forma curta (e.g. 'vec3f', 'atomic<u32>'). */
    readonly wgsl: string;
}

const TABLE: Readonly<Record<FieldType, FieldInfo>> = {
    [FieldType.f32]: {
        bytes: 4,
        align: 4,
        elements: 1,
        elementBytes: 4,
        ctor: Float32Array,
        wgsl: 'f32',
    },
    [FieldType.vec2f]: {
        bytes: 8,
        align: 8,
        elements: 2,
        elementBytes: 4,
        ctor: Float32Array,
        wgsl: 'vec2f',
    },
    [FieldType.vec3f]: {
        bytes: 12,
        align: 16,
        elements: 3,
        elementBytes: 4,
        ctor: Float32Array,
        wgsl: 'vec3f',
    },
    [FieldType.vec4f]: {
        bytes: 16,
        align: 16,
        elements: 4,
        elementBytes: 4,
        ctor: Float32Array,
        wgsl: 'vec4f',
    },
    [FieldType.mat3x3f]: {
        bytes: 48,
        align: 16,
        elements: 12,
        elementBytes: 4,
        ctor: Float32Array,
        wgsl: 'mat3x3f',
    },
    [FieldType.mat4x4f]: {
        bytes: 64,
        align: 16,
        elements: 16,
        elementBytes: 4,
        ctor: Float32Array,
        wgsl: 'mat4x4f',
    },
    [FieldType.u32]: {
        bytes: 4,
        align: 4,
        elements: 1,
        elementBytes: 4,
        ctor: Uint32Array,
        wgsl: 'u32',
    },
    [FieldType.vec2u]: {
        bytes: 8,
        align: 8,
        elements: 2,
        elementBytes: 4,
        ctor: Uint32Array,
        wgsl: 'vec2u',
    },
    [FieldType.vec3u]: {
        bytes: 12,
        align: 16,
        elements: 3,
        elementBytes: 4,
        ctor: Uint32Array,
        wgsl: 'vec3u',
    },
    [FieldType.vec4u]: {
        bytes: 16,
        align: 16,
        elements: 4,
        elementBytes: 4,
        ctor: Uint32Array,
        wgsl: 'vec4u',
    },
    [FieldType.i32]: {
        bytes: 4,
        align: 4,
        elements: 1,
        elementBytes: 4,
        ctor: Int32Array,
        wgsl: 'i32',
    },
    [FieldType.vec2i]: {
        bytes: 8,
        align: 8,
        elements: 2,
        elementBytes: 4,
        ctor: Int32Array,
        wgsl: 'vec2i',
    },
    [FieldType.vec3i]: {
        bytes: 12,
        align: 16,
        elements: 3,
        elementBytes: 4,
        ctor: Int32Array,
        wgsl: 'vec3i',
    },
    [FieldType.vec4i]: {
        bytes: 16,
        align: 16,
        elements: 4,
        elementBytes: 4,
        ctor: Int32Array,
        wgsl: 'vec4i',
    },
    [FieldType.atomicU32]: {
        bytes: 4,
        align: 4,
        elements: 1,
        elementBytes: 4,
        ctor: Uint32Array,
        wgsl: 'atomic<u32>',
    },
    [FieldType.atomicI32]: {
        bytes: 4,
        align: 4,
        elements: 1,
        elementBytes: 4,
        ctor: Int32Array,
        wgsl: 'atomic<i32>',
    },
};

/** Bytes ocupados por um field deste tipo (vec3 = 12, com padding 16 separado em fieldAlign). */
export function fieldBytes(t: FieldType): number {
    return TABLE[t].bytes;
}
/** Alinhamento WGSL exigido para este tipo (vec3 alinha em 16). */
export function fieldAlign(t: FieldType): number {
    return TABLE[t].align;
}
/** Número de elementos primitivos do tipo (f32 = 1, vec3f = 3, mat4x4f = 16). */
export function fieldElements(t: FieldType): number {
    return TABLE[t].elements;
}
/** Bytes por elemento primitivo (4 = float/int). */
export function fieldElementBytes(t: FieldType): number {
    return TABLE[t].elementBytes;
}
/** Constructor do TypedArray correspondente para alocar buffers do tipo. */
export function fieldCtor(t: FieldType): TypedArrayCtor {
    return TABLE[t].ctor;
}
/** Nome WGSL (forma curta) — usado para gerar struct definitions sincronizadas. */
export function fieldWgsl(t: FieldType): string {
    return TABLE[t].wgsl;
}

/** `true` para os tipos atômicos (só em storage). */
export function fieldIsAtomic(t: FieldType): boolean {
    return t === FieldType.atomicU32 || t === FieldType.atomicI32;
}
