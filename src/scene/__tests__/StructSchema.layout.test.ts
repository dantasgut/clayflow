import { describe, expect, it } from 'vitest';
import {
    StructSchema,
    fieldArray,
    fieldRuntimeArray,
    fieldStruct,
} from '../descriptors/StructSchema';
import { FieldType } from '../descriptors/FieldType';

describe('StructSchema — layout de storage (regras do WGSL)', () => {
    it.each([
        [FieldType.f32, 4, 4],
        [FieldType.vec2f, 8, 8],
        [FieldType.vec3f, 16, 12],
        [FieldType.vec4f, 16, 16],
        [FieldType.mat3x3f, 16, 48],
        [FieldType.mat4x4f, 16, 64],
        [FieldType.atomicU32, 4, 4],
        [FieldType.atomicI32, 4, 4],
    ])('%s: align %i, tamanho %i', (type, align, size) => {
        const s = new StructSchema('S', { a: FieldType.u32, b: type });
        expect(s.offsetOf('b')).toBe(Math.ceil(4 / align) * align);
        expect(s.align).toBe(Math.max(4, align));
        expect(s.stride).toBe(Math.ceil((s.offsetOf('b') + size) / s.align) * s.align);
    });

    it('vec3f seguido de f32 compartilha os 16 bytes', () => {
        const s = new StructSchema('S', { p: FieldType.vec3f, w: FieldType.f32 });
        expect(s.offsetOf('w')).toBe(12);
        expect(s.stride).toBe(16);
    });

    it('array<vec3f, 3>: stride do elemento 16, tamanho 48', () => {
        const s = new StructSchema('S', { a: fieldArray(FieldType.vec3f, 3), b: FieldType.f32 });
        expect(s.offsetOf('b')).toBe(48);
        expect(s.stride).toBe(64);
    });

    it('array<f32, 5> em storage: stride 4', () => {
        const s = new StructSchema('S', { a: fieldArray(FieldType.f32, 5), b: FieldType.u32 });
        expect(s.offsetOf('b')).toBe(20);
    });

    it('struct aninhado: alinhamento e tamanho do filho', () => {
        const inner = new StructSchema('Inner', { x: FieldType.f32, y: FieldType.vec2f });
        expect(inner.align).toBe(8);
        expect(inner.stride).toBe(16);
        const s = new StructSchema('Outer', {
            a: FieldType.f32,
            i: fieldStruct(inner),
            b: FieldType.f32,
        });
        expect(s.offsetOf('i')).toBe(8);
        expect(s.offsetOf('b')).toBe(24);
        expect(s.dependencies).toEqual([inner]);
    });

    it('array de tamanho em execução só como último campo', () => {
        const ok = new StructSchema('S', {
            n: FieldType.u32,
            items: fieldRuntimeArray(FieldType.vec4f),
        });
        expect(ok.offsetOf('items')).toBe(16);
        expect(ok.stride).toBe(16);
        expect(
            () =>
                new StructSchema('S', {
                    items: fieldRuntimeArray(FieldType.f32),
                    n: FieldType.u32,
                }),
        ).toThrow(/último campo/);
    });

    it('dependências transitivas em ordem de dependência', () => {
        const a = new StructSchema('A', { x: FieldType.f32 });
        const b = new StructSchema('B', { a: fieldStruct(a) });
        const c = new StructSchema('C', { b: fieldStruct(b), a2: fieldArray(fieldStruct(a), 2) });
        expect(c.dependencies).toEqual([a, b]);
    });
});

describe('StructSchema — layout de uniform', () => {
    it('struct aninhado alinhado e dimensionado a 16', () => {
        const inner = new StructSchema('InnerU', { x: FieldType.f32 }, { addressSpace: 'uniform' });
        const s = new StructSchema(
            'OuterU',
            { a: FieldType.f32, i: fieldStruct(inner), b: FieldType.f32 },
            { addressSpace: 'uniform' },
        );
        expect(s.offsetOf('i')).toBe(16);
        expect(s.offsetOf('b')).toBe(32);
        expect(s.toWGSL()).toContain('@align(16) @size(16) i: InnerU,');
    });

    it('array de vec4f permitido; array de escalares recusado', () => {
        const ok = new StructSchema(
            'U',
            { a: fieldArray(FieldType.vec4f, 2) },
            { addressSpace: 'uniform' },
        );
        expect(ok.stride).toBe(32);
        expect(
            () =>
                new StructSchema(
                    'U',
                    { a: fieldArray(FieldType.f32, 4) },
                    { addressSpace: 'uniform' },
                ),
        ).toThrow(/alinhamento 16/);
    });

    it('atômicos e array em execução recusados', () => {
        expect(
            () => new StructSchema('U', { c: FieldType.atomicU32 }, { addressSpace: 'uniform' }),
        ).toThrow(/atômicos/);
        expect(
            () =>
                new StructSchema(
                    'U',
                    { a: fieldRuntimeArray(FieldType.vec4f) },
                    { addressSpace: 'uniform' },
                ),
        ).toThrow(/storage/);
    });

    it('struct aninhado de storage em uniform é recusado', () => {
        const inner = new StructSchema('InnerS', { x: FieldType.vec4f });
        expect(
            () => new StructSchema('U', { i: fieldStruct(inner) }, { addressSpace: 'uniform' }),
        ).toThrow(/precisa ser de uniform/);
    });
});

describe('StructSchema — nomes', () => {
    it('wgslName separado do nome (pool key)', () => {
        const s = new StructSchema(
            'LCPSchema',
            { pos: FieldType.vec4f },
            { wgslName: 'RigidBody' },
        );
        expect(s.name).toBe('LCPSchema');
        expect(s.wgslName).toBe('RigidBody');
        expect(s.toWGSL()).toMatch(/^struct RigidBody \{/);
    });

    it.each(['1abc', 'com-hífen', 'struct', 'f32'])('wgslName inválido %s', (bad) => {
        expect(() => new StructSchema('S', { a: FieldType.f32 }, { wgslName: bad })).toThrow(
            /identificador/,
        );
    });

    it('campo com nome inválido', () => {
        expect(() => new StructSchema('S', { var: FieldType.f32 })).toThrow(/identificador/);
    });

    it('FieldType não tem tipos de 16 bits', () => {
        expect(Object.values(FieldType)).not.toContain('u16');
        expect(Object.values(FieldType)).not.toContain('i16');
    });
});
