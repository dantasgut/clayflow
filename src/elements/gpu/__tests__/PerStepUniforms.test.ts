import { describe, expect, it } from 'vitest';
import { PerStepUniforms } from '../compute/PerStepUniforms';
import { fakeResourceCore } from '../../../scene/__tests__/helpers/fakeResourceCore';
import type { UniformBufferSpec } from '../../../scene/contracts/gpu';
import { StructSchema, fieldArray } from '../../../scene/descriptors/StructSchema';
import { FieldType } from '../../../scene/descriptors/FieldType';

/** Schema de uniform com `vec4f`s suficientes para `bytes` (múltiplo de 16). */
function schemaOf(bytes: number): StructSchema {
    return new StructSchema(
        `P${bytes}`,
        { x: FieldType.f32, n: FieldType.u32, rest: fieldArray(FieldType.vec4f, bytes / 16 - 1) },
        { addressSpace: 'uniform' },
    );
}

function setup(bytes = 80) {
    const { core, writes } = fakeResourceCore();
    const schema = schemaOf(bytes);
    const params = new PerStepUniforms(core, { discriminator: 'test_params', schema });
    return { core, writes, params, schema };
}

describe('PerStepUniforms — uma região de parâmetros por iteração', () => {
    it('região alinhada a minUniformBufferOffsetAlignment (256)', () => {
        const { params } = setup(80);
        expect(params.regionSize).toBe(256);
        expect(params.offset(0)).toBe(0);
        expect(params.offset(3)).toBe(768);
    });

    it('struct maior que o alinhamento ocupa múltiplos do alinhamento', () => {
        const { params } = setup(304);
        expect(params.regionSize).toBe(512);
    });

    it('reserve cria o buffer com capacidade × região e devolve true só quando recria', () => {
        const { params } = setup();
        expect(params.reserve(8)).toBe(true);
        expect(params.capacity).toBeGreaterThanOrEqual(8);
        expect(params.buffer.byteSize).toBe(params.capacity * 256);
        expect(params.reserve(8)).toBe(false);
        expect(params.reserve(2)).toBe(false);
    });

    it('uma única escrita por quadro com as regiões usadas preenchidas', () => {
        const { params, writes } = setup();
        params.reserve(4);
        for (let i = 0; i < 3; i++) params.write(i, { x: i + 0.5, n: i === 2 ? 7 : 0 });
        params.flush(3);
        expect(writes).toHaveLength(1);
        const w = writes[0]!;
        expect(w.spec).toBe(params.buffer);
        expect(w.offset).toBe(0);
        expect(w.bytes.byteLength).toBe(3 * 256);
        const f = new Float32Array(w.bytes.buffer, w.bytes.byteOffset, w.bytes.byteLength / 4);
        expect(f[0]).toBe(0.5);
        expect(f[64]).toBe(1.5);
        expect(f[128]).toBe(2.5);
        expect(new Uint32Array(w.bytes.buffer, w.bytes.byteOffset)[129]).toBe(7);
    });

    it('flush(0) não escreve', () => {
        const { params, writes } = setup();
        params.reserve(2);
        params.flush(0);
        expect(writes).toHaveLength(0);
    });

    it('source(): fonte com offset dinâmico de passo regionSize e tamanho do struct', () => {
        const { params } = setup(80);
        params.reserve(1);
        expect(params.source()).toEqual({
            kind: 'buffer',
            buffer: params.buffer,
            size: 80,
            dynamic: { stride: 256 },
        });
    });

    it('source() acompanha o buffer recriado pelo reserve', () => {
        const { params } = setup(80);
        params.reserve(1);
        const first = params.source();
        params.reserve(5);
        expect(params.source()).not.toEqual(first);
        expect(params.source()).toMatchObject({ buffer: params.buffer });
    });

    it('crescimento recria o buffer, destrói o anterior e incrementa a geração', () => {
        const { core, params } = setup();
        params.reserve(4);
        const old: UniformBufferSpec = params.buffer;
        const gen = params.generation;
        expect(params.reserve(params.capacity + 1)).toBe(true);
        expect(params.buffer).not.toBe(old);
        expect(params.generation).toBe(gen + 1);
        expect(core.destroy).toHaveBeenCalledWith(old);
    });

    it('acesso a região além da capacidade lança', () => {
        const { params } = setup();
        params.reserve(2);
        expect(() => {
            params.write(params.capacity, {});
        }).toThrow(RangeError);
        expect(() => {
            params.flush(params.capacity + 1);
        }).toThrow(RangeError);
    });

    it('dispose destrói o buffer', () => {
        const { core, params } = setup();
        params.reserve(1);
        const buf = params.buffer;
        params.dispose();
        expect(core.destroy).toHaveBeenCalledWith(buf);
    });

    it('schema que não é de uniform é recusado', () => {
        const { core } = fakeResourceCore();
        const storage = new StructSchema('S', { a: FieldType.vec4f });
        expect(() => new PerStepUniforms(core, { discriminator: 'bad', schema: storage })).toThrow(
            /uniform/,
        );
    });
});
