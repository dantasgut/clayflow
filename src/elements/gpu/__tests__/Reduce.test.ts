import { describe, expect, it, vi } from 'vitest';
import { Reduce, reduceLevelCounts } from '../compute/Reduce';
import { reduceKernel, reduceOp } from '../compute/shaders';
import { composeWgsl } from '../../../scene/shaders/composeWgsl';
import { fakeResourceCore } from '../../../scene/__tests__/helpers/fakeResourceCore';
import { recordingFrame } from '../../physics/__tests__/helpers/recordingFrame';
import type { StorageBufferSpec } from '../../../core/contracts/index';

/** Buffers de teste por nome — o mesmo objeto a cada chamada (a preparação reconhece o buffer pela identidade). */
const buffers = new Map<string, StorageBufferSpec>();
const buffer = (discriminator: string): StorageBufferSpec => {
    let b = buffers.get(discriminator);
    if (b === undefined) {
        b = { kind: 'buffer', subkind: 'storage', discriminator, byteSize: 1 << 16 };
        buffers.set(discriminator, b);
    }
    return b;
};

describe('reduceOp', () => {
    it('memorizado por (operação, tipo)', () => {
        expect(reduceOp('sum', 'f32')).toBe(reduceOp('sum', 'f32'));
        expect(reduceOp('sum', 'f32')).not.toBe(reduceOp('sum', 'u32'));
        expect(reduceKernel('max', 'i32')).toBe(reduceKernel('max', 'i32'));
    });

    it.each([
        ['sum', 'u32', '0u', 'a + b'],
        ['sum', 'f32', '0.0', 'a + b'],
        ['min', 'u32', '0xFFFFFFFFu', 'min(a, b)'],
        ['min', 'i32', '2147483647i', 'min(a, b)'],
        ['min', 'f32', '0x1.fffffep+127f', 'min(a, b)'],
        ['max', 'u32', '0u', 'max(a, b)'],
        ['max', 'i32', '-2147483647i - 1i', 'max(a, b)'],
        ['max', 'f32', '-0x1.fffffep+127f', 'max(a, b)'],
    ] as const)('%s/%s: identidade %s e operação %s', (op, type, identity, expr) => {
        const src = reduceOp(op, type).source;
        expect(src).toContain(`alias ReduceT = ${type};`);
        expect(src).toContain(`const REDUCE_IDENTITY: ReduceT = ${identity};`);
        expect(src).toContain(`return ${expr};`);
        expect(() => composeWgsl(reduceKernel(op, type))).not.toThrow();
    });
});

describe('Reduce', () => {
    it.each([
        [1, [1, 1]],
        [256, [256, 1]],
        [257, [257, 2, 1]],
        [4_194_304, [4_194_304, 16_384, 64, 1]],
    ])('%i elementos → níveis %j', (count, counts) => {
        expect(reduceLevelCounts(count)).toEqual(counts);
    });

    it('passes por nível; o último escreve no outOffset do chamador', () => {
        const { core, writes } = fakeResourceCore();
        const reduce = new Reduce(core, {
            discriminator: 'rd',
            capacity: 70_000,
            op: 'sum',
            type: 'u32',
        });
        reduce.prepare(buffer('src'), buffer('out'));
        const created = vi.mocked(core.create).mock.calls.length;
        const rec = recordingFrame();
        reduce.record(rec.frame, {
            src: buffer('src'),
            count: 70_000,
            out: buffer('out'),
            outOffset: 3,
        });
        expect(vi.mocked(core.create).mock.calls.length).toBe(created);
        expect(rec.passes.map((p) => p.dispatches[0])).toEqual([
            [70_000, 256],
            [274, 256],
            [2, 256],
        ]);
        const levels = writes.map((w) => [
            ...new Uint32Array(w.bytes.buffer, w.bytes.byteOffset, 2),
        ]);
        expect(levels).toEqual([
            [70_000, 0],
            [274, 0],
            [2, 3],
        ]);
    });

    it('validação: count > capacity, outOffset negativo; count = 0 não grava', () => {
        const { core } = fakeResourceCore();
        const reduce = new Reduce(core, {
            discriminator: 'rd',
            capacity: 10,
            op: 'min',
            type: 'f32',
        });
        const rec = recordingFrame();
        expect(() => {
            reduce.record(rec.frame, { src: buffer('s'), count: 11, out: buffer('o') });
        }).toThrow(RangeError);
        expect(() => {
            reduce.record(rec.frame, {
                src: buffer('s'),
                count: 1,
                out: buffer('o'),
                outOffset: -1,
            });
        }).toThrow(RangeError);
        reduce.record(rec.frame, { src: buffer('s'), count: 0, out: buffer('o') });
        expect(rec.passes).toHaveLength(0);
        expect(() => {
            reduce.record(rec.frame, { src: buffer('s'), count: 1, out: buffer('o') });
        }).toThrow(/prepare/);
    });

    it('contagens com menos passes que a capacidade usam o kernel que escreve direto na saída', () => {
        const { core } = fakeResourceCore();
        const reduce = new Reduce(core, {
            discriminator: 'rd',
            capacity: 70_000,
            op: 'max',
            type: 'u32',
        });
        reduce.prepare(buffer('src'), buffer('out'));
        const rec = recordingFrame();
        reduce.record(rec.frame, { src: buffer('src'), count: 100, out: buffer('out') });
        expect(rec.passes.map((p) => p.dispatches[0])).toEqual([[100, 256]]);
    });
});
