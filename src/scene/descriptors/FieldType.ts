export enum FieldType {
    f32 = 'f32',
    vec2f = 'vec2f',
    vec3f = 'vec3f',
    vec4f = 'vec4f',
    mat3x3f = 'mat3x3f',
    mat4x4f = 'mat4x4f',
    u32 = 'u32',
    vec2u = 'vec2u',
    vec3u = 'vec3u',
    vec4u = 'vec4u',
    i32 = 'i32',
    vec2i = 'vec2i',
    vec3i = 'vec3i',
    vec4i = 'vec4i',
    u16 = 'u16',
    i16 = 'i16',
}

export type TypedArrayCtor =
    | Float32ArrayConstructor
    | Uint32ArrayConstructor
    | Int32ArrayConstructor
    | Uint16ArrayConstructor
    | Int16ArrayConstructor;

interface FieldInfo {
    readonly bytes: number;
    readonly align: number;
    readonly elements: number;
    readonly elementBytes: number;
    readonly ctor: TypedArrayCtor;
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
        wgsl: 'vec2<f32>',
    },
    [FieldType.vec3f]: {
        bytes: 12,
        align: 16,
        elements: 3,
        elementBytes: 4,
        ctor: Float32Array,
        wgsl: 'vec3<f32>',
    },
    [FieldType.vec4f]: {
        bytes: 16,
        align: 16,
        elements: 4,
        elementBytes: 4,
        ctor: Float32Array,
        wgsl: 'vec4<f32>',
    },
    [FieldType.mat3x3f]: {
        bytes: 48,
        align: 16,
        elements: 12,
        elementBytes: 4,
        ctor: Float32Array,
        wgsl: 'mat3x3<f32>',
    },
    [FieldType.mat4x4f]: {
        bytes: 64,
        align: 16,
        elements: 16,
        elementBytes: 4,
        ctor: Float32Array,
        wgsl: 'mat4x4<f32>',
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
        wgsl: 'vec2<u32>',
    },
    [FieldType.vec3u]: {
        bytes: 12,
        align: 16,
        elements: 3,
        elementBytes: 4,
        ctor: Uint32Array,
        wgsl: 'vec3<u32>',
    },
    [FieldType.vec4u]: {
        bytes: 16,
        align: 16,
        elements: 4,
        elementBytes: 4,
        ctor: Uint32Array,
        wgsl: 'vec4<u32>',
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
        wgsl: 'vec2<i32>',
    },
    [FieldType.vec3i]: {
        bytes: 12,
        align: 16,
        elements: 3,
        elementBytes: 4,
        ctor: Int32Array,
        wgsl: 'vec3<i32>',
    },
    [FieldType.vec4i]: {
        bytes: 16,
        align: 16,
        elements: 4,
        elementBytes: 4,
        ctor: Int32Array,
        wgsl: 'vec4<i32>',
    },
    [FieldType.u16]: {
        bytes: 2,
        align: 2,
        elements: 1,
        elementBytes: 2,
        ctor: Uint16Array,
        wgsl: 'u16',
    },
    [FieldType.i16]: {
        bytes: 2,
        align: 2,
        elements: 1,
        elementBytes: 2,
        ctor: Int16Array,
        wgsl: 'i16',
    },
};

export function fieldBytes(t: FieldType): number {
    return TABLE[t].bytes;
}
export function fieldAlign(t: FieldType): number {
    return TABLE[t].align;
}
export function fieldElements(t: FieldType): number {
    return TABLE[t].elements;
}
export function fieldElementBytes(t: FieldType): number {
    return TABLE[t].elementBytes;
}
export function fieldCtor(t: FieldType): TypedArrayCtor {
    return TABLE[t].ctor;
}
export function fieldWgsl(t: FieldType): string {
    return TABLE[t].wgsl;
}
