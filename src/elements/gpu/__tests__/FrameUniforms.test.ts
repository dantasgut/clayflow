import { describe, expect, it } from 'vitest';
import { FrameUniforms } from '../compute/FrameUniforms';
import { ScanLevelSchema } from '../compute/schemas';
import { recordingFrame } from '../../physics/__tests__/helpers/recordingFrame';
import { workHarness } from './helpers/workHarness';

function setup() {
    const h = workHarness();
    const uniforms = new FrameUniforms(h.ctx, { id: 'fu', schema: ScanLevelSchema });
    return { ...h, uniforms };
}

describe('FrameUniforms (spec 039: uniforme por região do trabalho)', () => {
    it('schema que não é de uniform → TypeError', () => {
        const h = workHarness();
        expect(
            () =>
                new FrameUniforms(h.ctx, {
                    id: 'x',
                    schema: { addressSpace: 'storage', name: 'S' } as never,
                }),
        ).toThrow(TypeError);
    });

    it('reserve em potência de 2, idempotente quando cabe; maior realoca pela C2 e libera o anterior', () => {
        const { uniforms, resources, work, core } = setup();
        expect(uniforms.reserve(3)).toBe(true);
        expect(uniforms.capacity).toBe(4);
        expect(uniforms.reserve(4)).toBe(false);
        const first = resources.bufferOf(work, 'fu');
        expect(first?.byteSize).toBe(4 * 256);
        expect(uniforms.reserve(5)).toBe(true);
        expect(uniforms.generation).toBe(2);
        expect(core.destroy).toHaveBeenCalledWith(first);
    });

    it('regiões consecutivas no quadro, alinhadas ao adaptador; quadro novo recomeça', () => {
        const { uniforms } = setup();
        uniforms.reserve(4);
        const frame = recordingFrame().frame;
        expect([0, 1, 2].map((count) => uniforms.allocate(frame, { count }))).toEqual([
            0, 256, 512,
        ]);
        expect(uniforms.allocate(recordingFrame().frame, { count: 9 })).toBe(0);
    });

    it('allocate grava a região pela C2 (sem criar objetos); passar das reservadas → RangeError', () => {
        const { uniforms, resources, work, bytesOf, core } = setup();
        expect(() => uniforms.allocate(recordingFrame().frame, { count: 1 })).toThrow(/reserve/);
        uniforms.reserve(2);
        const created = (core.create as unknown as { mock: { calls: unknown[] } }).mock.calls
            .length;
        const frame = recordingFrame().frame;
        uniforms.allocate(frame, { count: 10 });
        uniforms.allocate(frame, { count: 11 });
        expect(() => uniforms.allocate(frame, { count: 3 })).toThrow(RangeError);
        expect((core.create as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(
            created,
        );
        const bytes = new Uint32Array(bytesOf(resources.bufferOf(work, 'fu')!).buffer);
        expect([bytes[0], bytes[256 / 4]]).toEqual([10, 11]);
        expect(uniforms.source()).toMatchObject({
            size: ScanLevelSchema.stride,
            dynamic: { stride: 256 },
        });
    });
});
