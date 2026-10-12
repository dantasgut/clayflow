import { describe, expect, it } from 'vitest';
import { StructSchema, fieldArray, fieldStruct } from '../descriptors/StructSchema';
import { FieldType } from '../descriptors/FieldType';

describe('StructSchema.toWGSL', () => {
    it('tipos na forma curta, atômicos e arrays', () => {
        const s = new StructSchema('Counter', {
            count: FieldType.atomicU32,
            overflow: FieldType.atomicI32,
            dirs: fieldArray(FieldType.vec3f, 4),
            m: FieldType.mat3x3f,
        });
        expect(s.toWGSL()).toBe(
            [
                'struct Counter {',
                '    count: atomic<u32>,',
                '    overflow: atomic<i32>,',
                '    dirs: array<vec3f, 4>,',
                '    m: mat3x3f,',
                '}',
            ].join('\n'),
        );
    });

    it('struct aninhado pelo wgslName do filho', () => {
        const inner = new StructSchema('InnerPool', { x: FieldType.f32 }, { wgslName: 'Inner' });
        const s = new StructSchema('Outer', { items: fieldArray(fieldStruct(inner), 2) });
        expect(s.toWGSL()).toContain('items: array<Inner, 2>,');
    });
});

describe('StructSchema.packInto / pack', () => {
    const schema = new StructSchema('P', {
        a: FieldType.f32,
        b: FieldType.vec3f,
        c: FieldType.u32,
        d: fieldArray(FieldType.vec4f, 2),
    });

    it('escreve exatamente stride bytes no offset, com padding zerado', () => {
        const buf = new ArrayBuffer(schema.stride * 3);
        new Uint8Array(buf).fill(0xff);
        schema.packInto(buf, schema.stride, {
            a: 1,
            b: [2, 3, 4],
            c: 7,
            d: [
                [1, 1, 1, 1],
                [2, 2, 2, 2],
            ],
        });
        const bytes = new Uint8Array(buf);
        expect(bytes.subarray(0, schema.stride).every((x) => x === 0xff)).toBe(true);
        expect(bytes.subarray(2 * schema.stride).every((x) => x === 0xff)).toBe(true);
        const f = new Float32Array(buf, schema.stride, schema.stride / 4);
        const u = new Uint32Array(buf, schema.stride, schema.stride / 4);
        expect(f[schema.offsetOf('a') / 4]).toBe(1);
        expect(Array.from(f.subarray(4, 7))).toEqual([2, 3, 4]);
        expect(u[schema.offsetOf('c') / 4]).toBe(7);
        expect(
            Array.from(f.subarray(schema.offsetOf('d') / 4, schema.offsetOf('d') / 4 + 8)),
        ).toEqual([1, 1, 1, 1, 2, 2, 2, 2]);
    });

    it('pack é packInto num buffer novo', () => {
        const data = { a: 5, b: [1, 2, 3], c: 9, d: [] };
        const fresh = new ArrayBuffer(schema.stride);
        schema.packInto(fresh, 0, data);
        expect(schema.pack(data)).toEqual(new Uint8Array(fresh));
    });

    it('packInto numa view com byteOffset', () => {
        const backing = new ArrayBuffer(schema.stride + 16);
        const view = new Uint8Array(backing, 16, schema.stride);
        schema.packInto(view, 0, { a: 3 });
        expect(new Float32Array(backing, 16, 1)[0]).toBe(3);
    });

    it('struct aninhado empacotado no offset do campo', () => {
        const inner = new StructSchema('In', { x: FieldType.f32, y: FieldType.f32 });
        const outer = new StructSchema('Out', { k: FieldType.u32, i: fieldStruct(inner) });
        const f = new Float32Array(outer.pack({ k: 1, i: { x: 2.5, y: 3.5 } }).buffer);
        expect(f[outer.offsetOf('i') / 4]).toBe(2.5);
        expect(f[outer.offsetOf('i') / 4 + 1]).toBe(3.5);
    });

    it('atômico recebe o valor inicial', () => {
        const s = new StructSchema('C', { n: FieldType.atomicU32, m: FieldType.atomicI32 });
        const bytes = s.pack({ n: 3, m: -2 });
        expect(new Uint32Array(bytes.buffer)[0]).toBe(3);
        expect(new Int32Array(bytes.buffer)[1]).toBe(-2);
    });

    it('offset não alinhado a 4 → erro', () => {
        expect(() => {
            schema.packInto(new ArrayBuffer(256), 2, {});
        }).toThrow(/alinhado/);
    });

    it('applyDefaults preenche arrays e structs aninhados', () => {
        const inner = new StructSchema('In2', { x: FieldType.f32 });
        const s = new StructSchema('D', {
            v: fieldArray(FieldType.vec2f, 2),
            i: fieldStruct(inner),
        });
        expect(s.applyDefaults({})).toEqual({
            v: [
                [0, 0],
                [0, 0],
            ],
            i: { x: 0 },
        });
    });
});
