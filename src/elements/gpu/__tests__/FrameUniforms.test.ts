import { describe, expect, it } from 'vitest';
import { FrameUniforms } from '../compute/FrameUniforms';
import { ScanLevelSchema } from '../compute/schemas';
import { fakeResourceCore } from '../../../scene/__tests__/helpers/fakeResourceCore';
import { recordingFrame } from '../../physics/__tests__/helpers/recordingFrame';

const disc = (spec: unknown): string => (spec as { discriminator: string }).discriminator;

function setup(initialRegions: number) {
    const { core, writes } = fakeResourceCore();
    const uniforms = new FrameUniforms(core, {
        discriminator: 'fu',
        schema: ScanLevelSchema,
        initialRegions,
    });
    return { core, writes, uniforms };
}

/** Contagens gravadas em cada região do buffer `discriminator`, aplicando as escritas em ordem. */
function regions(writes: ReturnType<typeof fakeResourceCore>['writes'], discriminator: string) {
    const memory = new Map<number, number>();
    for (const w of writes.filter((x) => disc(x.spec) === discriminator)) {
        const u32 = new Uint32Array(w.bytes.buffer, w.bytes.byteOffset, w.bytes.byteLength / 4);
        for (let k = 0; k < u32.length; k += 64) memory.set(w.offset + k * 4, u32[k]!);
    }
    return memory;
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

    it('regiões consecutivas no quadro, alinhadas a minUniformBufferOffsetAlignment', () => {
        const { uniforms } = setup(4);
        const frame = recordingFrame().frame;
        expect([0, 1, 2].map((count) => uniforms.allocate(frame, { count }))).toEqual([
            0, 256, 512,
        ]);
        expect(uniforms.allocate(recordingFrame().frame, { count: 9 })).toBe(0);
    });

    it('crescimento no meio do quadro regrava no buffer novo as regiões já gravadas', () => {
        const { uniforms, writes } = setup(2);
        const frame = recordingFrame().frame;
        uniforms.allocate(frame, { count: 10 });
        uniforms.allocate(frame, { count: 11 });
        expect(uniforms.generation).toBe(1);
        uniforms.allocate(frame, { count: 12 });
        expect(uniforms.generation).toBe(2);
        const fresh = regions(writes, 'fu:frame_uniforms:2');
        expect([...fresh.entries()].sort((a, b) => a[0] - b[0])).toEqual([
            [0, 10],
            [256, 11],
            [512, 12],
        ]);
    });

    it('buffer aposentado destruído só no quadro seguinte; destroy libera tudo', () => {
        const { core, uniforms } = setup(1);
        const frame = recordingFrame().frame;
        uniforms.allocate(frame, { count: 1 });
        uniforms.allocate(frame, { count: 2 });
        const destroyed = () =>
            (core.destroy as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) =>
                disc(c[0]),
            );
        expect(destroyed()).toEqual([]);
        uniforms.allocate(recordingFrame().frame, { count: 3 });
        expect(destroyed()).toEqual(['fu:frame_uniforms:1']);
        uniforms.destroy();
        expect(destroyed()).toEqual(['fu:frame_uniforms:1', 'fu:frame_uniforms:2']);
    });
});
