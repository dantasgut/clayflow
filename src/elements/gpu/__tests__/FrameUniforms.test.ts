import { describe, expect, it, vi } from 'vitest';
import { FrameUniforms } from '../compute/FrameUniforms';
import { ScanLevelSchema } from '../compute/schemas';
import { fakeResourceCore } from '../../../scene/__tests__/helpers/fakeResourceCore';
import { recordingFrame } from '../../physics/__tests__/helpers/recordingFrame';

const disc = (spec: unknown): string => (spec as { discriminator: string }).discriminator;

function setup() {
    const { core, writes } = fakeResourceCore();
    const uniforms = new FrameUniforms(core, { discriminator: 'fu', schema: ScanLevelSchema });
    return { core, writes, uniforms };
}

describe('FrameUniforms', () => {
    it('schema que não é de uniform → TypeError', () => {
        const { core } = fakeResourceCore();
        expect(
            () =>
                new FrameUniforms(core, {
                    discriminator: 'x',
                    schema: { addressSpace: 'storage', name: 'S' } as never,
                }),
        ).toThrow(TypeError);
    });

    it('reserve cria o buffer com capacidade em potência de 2; idempotente quando cabe', () => {
        const { uniforms, core } = setup();
        expect(uniforms.reserve(3)).toBe(true);
        expect(uniforms.capacity).toBe(4);
        expect(uniforms.reserve(4)).toBe(false);
        expect(vi.mocked(core.create).mock.calls.map((c) => disc(c[0]))).toEqual([
            'fu:frame_uniforms:1',
        ]);
        expect((vi.mocked(core.create).mock.calls[0]![0] as { byteSize: number }).byteSize).toBe(
            4 * 256,
        );
    });

    it('reserve maior recria o buffer e destrói o anterior na hora (fora da gravação)', () => {
        const { uniforms, core } = setup();
        uniforms.reserve(2);
        expect(uniforms.reserve(5)).toBe(true);
        expect(uniforms.capacity).toBe(8);
        expect(uniforms.generation).toBe(2);
        expect(vi.mocked(core.destroy).mock.calls.map((c) => disc(c[0]))).toEqual([
            'fu:frame_uniforms:1',
        ]);
    });

    it('regiões consecutivas no quadro, alinhadas a minUniformBufferOffsetAlignment; quadro novo recomeça', () => {
        const { uniforms } = setup();
        uniforms.reserve(4);
        const frame = recordingFrame().frame;
        expect([0, 1, 2].map((count) => uniforms.allocate(frame, { count }))).toEqual([
            0, 256, 512,
        ]);
        expect(uniforms.allocate(recordingFrame().frame, { count: 9 })).toBe(0);
    });

    it('allocate não cria objetos; passar das regiões reservadas → RangeError; antes de reserve → erro', () => {
        const { uniforms, core } = setup();
        expect(() => uniforms.allocate(recordingFrame().frame, { count: 1 })).toThrow(/reserve/);
        uniforms.reserve(2);
        const created = vi.mocked(core.create).mock.calls.length;
        const frame = recordingFrame().frame;
        uniforms.allocate(frame, { count: 1 });
        uniforms.allocate(frame, { count: 2 });
        expect(() => uniforms.allocate(frame, { count: 3 })).toThrow(RangeError);
        expect(vi.mocked(core.create).mock.calls.length).toBe(created);
    });

    it('cada região escrita no seu offset; source() é a fonte com offset dinâmico', () => {
        const { uniforms, writes } = setup();
        uniforms.reserve(2);
        const frame = recordingFrame().frame;
        uniforms.allocate(frame, { count: 10 });
        uniforms.allocate(frame, { count: 11 });
        expect(
            writes.map((w) => [
                w.offset,
                new Uint32Array(w.bytes.buffer, w.bytes.byteOffset, 1)[0],
            ]),
        ).toEqual([
            [0, 10],
            [256, 11],
        ]);
        expect(uniforms.source()).toMatchObject({
            kind: 'buffer',
            size: ScanLevelSchema.stride,
            dynamic: { stride: 256 },
        });
    });

    it('destroy libera o buffer', () => {
        const { uniforms, core } = setup();
        uniforms.reserve(1);
        uniforms.destroy();
        expect(vi.mocked(core.destroy).mock.calls.map((c) => disc(c[0]))).toEqual([
            'fu:frame_uniforms:1',
        ]);
        expect(uniforms.capacity).toBe(0);
    });
});
