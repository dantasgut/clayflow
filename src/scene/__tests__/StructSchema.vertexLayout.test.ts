import { describe, expect, it } from 'vitest';
import { StructSchema } from '../descriptors/StructSchema';
import { FieldType } from '../descriptors/FieldType';

describe('StructSchema.vertexLayout — layout de vértice compacto', () => {
    it('position vec3f, normal vec3f, uv vec2f → offsets 0/12/24, stride 32', () => {
        const schema = new StructSchema('V', {
            position: FieldType.vec3f,
            normal: FieldType.vec3f,
            uv: FieldType.vec2f,
        });
        expect(schema.stride).toBe(48); // struct WGSL (alinhado) ≠ vértice
        expect(schema.vertexLayout).toEqual({
            stride: 32,
            attributes: [
                { name: 'position', offset: 0, format: 'float32x3' },
                { name: 'normal', offset: 12, format: 'float32x3' },
                { name: 'uv', offset: 24, format: 'float32x2' },
            ],
        });
    });

    it('formatos inteiros e escalares', () => {
        const schema = new StructSchema('W', {
            a: FieldType.f32,
            b: FieldType.vec4f,
            c: FieldType.u32,
            d: FieldType.vec2u,
            e: FieldType.vec3i,
            f: FieldType.vec4u,
        });
        expect(schema.vertexLayout.attributes.map((x) => [x.offset, x.format])).toEqual([
            [0, 'float32'],
            [4, 'float32x4'],
            [20, 'uint32'],
            [24, 'uint32x2'],
            [32, 'sint32x3'],
            [44, 'uint32x4'],
        ]);
        expect(schema.vertexLayout.stride).toBe(60);
    });

    it.each([FieldType.mat4x4f, FieldType.mat3x3f, FieldType.u16, FieldType.i16])(
        'tipo %s não é atributo de vértice → lança',
        (type) => {
            const schema = new StructSchema('Bad', { x: type });
            expect(() => schema.vertexLayout).toThrow(/vértice/);
        },
    );

    it('é calculado uma vez (mesmo objeto)', () => {
        const schema = new StructSchema('V', { p: FieldType.vec3f });
        expect(schema.vertexLayout).toBe(schema.vertexLayout);
    });
});
