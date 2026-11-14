import { describe, expect, it } from 'vitest';
import { PerStepUniforms } from '../compute/PerStepUniforms';
import { ScanLevelSchema } from '../compute/schemas';
import { workHarness } from './helpers/workHarness';

function setup() {
    const h = workHarness();
    const uniforms = new PerStepUniforms(h.ctx, { id: 'ps', schema: ScanLevelSchema });
    return { ...h, uniforms };
}

describe('PerStepUniforms (spec 039: uniforme por região do trabalho)', () => {
    it('schema que não é de uniform → TypeError', () => {
        const h = workHarness();
        expect(
            () =>
                new PerStepUniforms(h.ctx, {
                    id: 'x',
                    schema: { addressSpace: 'storage', name: 'S' } as never,
                }),
        ).toThrow(TypeError);
    });

    it('reserve declara regiões em potência de 2 no trabalho; a C2 aloca no stride do adaptador', () => {
        const { uniforms, resources, work } = setup();
        expect(uniforms.reserve(3)).toBe(true);
        expect(uniforms.capacity).toBe(4);
        expect(uniforms.reserve(4)).toBe(false);
        expect(uniforms.regionSize).toBe(256);
        expect(resources.bufferOf(work, 'ps')?.byteSize).toBe(4 * 256);
    });

    it('reserve maior realoca pela C2, libera o anterior e incrementa generation', () => {
        const { uniforms, resources, work, core } = setup();
        uniforms.reserve(2);
        const first = resources.bufferOf(work, 'ps');
        expect(uniforms.reserve(5)).toBe(true);
        expect(uniforms.capacity).toBe(8);
        expect(uniforms.generation).toBe(2);
        expect(core.destroy).toHaveBeenCalledWith(first);
    });

    it('write + flush: cada região no seu offset, numa escrita; source() com offset dinâmico', () => {
        const { uniforms, resources, work, bytesOf } = setup();
        uniforms.reserve(2);
        uniforms.write(0, { count: 10 });
        uniforms.write(1, { count: 11 });
        uniforms.flush(2);
        const bytes = new Uint32Array(bytesOf(resources.bufferOf(work, 'ps')!).buffer);
        expect([bytes[0], bytes[256 / 4]]).toEqual([10, 11]);
        expect(uniforms.offset(1)).toBe(256);
        expect(uniforms.source()).toMatchObject({
            size: ScanLevelSchema.stride,
            dynamic: { stride: 256 },
        });
    });

    it('região fora da capacidade → RangeError; antes de reserve → erro', () => {
        const { uniforms } = setup();
        expect(() => uniforms.source()).toThrow(/reserve/);
        uniforms.reserve(1);
        expect(() => {
            uniforms.write(1, {});
        }).toThrow(RangeError);
        expect(() => {
            uniforms.flush(2);
        }).toThrow(RangeError);
    });
});
