import { describe, expect, it } from 'vitest';
import { RadixSort } from '../compute/RadixSort';
import { fakeResourceCore } from '../../../scene/__tests__/helpers/fakeResourceCore';
import { recordingFrame } from '../../physics/__tests__/helpers/recordingFrame';
import type { StorageBufferSpec } from '../../../scene/contracts/gpu';

/** Buffers de teste por nome — o mesmo objeto a cada chamada (a preparação reconhece o buffer pela identidade). */
const buffers = new Map<string, StorageBufferSpec>();
const buffer = (discriminator: string): StorageBufferSpec => {
    let b = buffers.get(discriminator);
    if (b === undefined) {
        b = { kind: 'buffer', subkind: 'storage', discriminator, byteSize: 1 << 20 };
        buffers.set(discriminator, b);
    }
    return b;
};

/** Ordenação preparada para as chaves `k` (e valores `v` com `withValues`). */
function setup(capacity: number, withValues = false) {
    const { core, writes } = fakeResourceCore();
    const sort = new RadixSort(core, { discriminator: 'rs', capacity, withValues });
    sort.prepare(buffer('k'), withValues ? buffer('v') : undefined);
    return { core, writes, sort };
}

/** Rótulos dos passes de alto nível (sem os do PrefixSum interno, resumidos como `scan`). */
function outline(labels: readonly string[]): string[] {
    const out: string[] = [];
    for (const l of labels) {
        if (l.startsWith('PrefixSum.')) {
            if (out[out.length - 1] !== 'scan') out.push('scan');
        } else out.push(l);
    }
    return out;
}

/**
 * Referência na CPU do algoritmo da GPU para um passe: histograma dígito-maior por grupo de 256, base exclusiva
 * global, ordenação local por quatro divisões estáveis por bit e posto dentro do dígito no grupo.
 */
function radixPass(
    keys: Uint32Array,
    values: Uint32Array,
    shift: number,
): [Uint32Array, Uint32Array] {
    const n = keys.length;
    const groups = Math.ceil(n / 256);
    const digit = (k: number) => (k >>> shift) & 15;
    const hist = new Uint32Array(16 * groups);
    for (let i = 0; i < n; i++) hist[digit(keys[i]!) * groups + Math.floor(i / 256)]!++;
    const base = new Uint32Array(hist.length);
    for (let i = 1; i < hist.length; i++) base[i] = base[i - 1]! + hist[i - 1]!;
    const outKeys = new Uint32Array(n);
    const outValues = new Uint32Array(n);
    for (let g = 0; g < groups; g++) {
        let local = Array.from({ length: Math.min(256, n - g * 256) }, (_, j) => g * 256 + j);
        for (let bit = 0; bit < 4; bit++) {
            const zeros = local.filter((i) => ((digit(keys[i]!) >> bit) & 1) === 0);
            const ones = local.filter((i) => ((digit(keys[i]!) >> bit) & 1) === 1);
            local = [...zeros, ...ones];
        }
        local.forEach((src, li) => {
            const d = digit(keys[src]!);
            const start = local.findIndex((i) => digit(keys[i]!) === d);
            const dest = base[d * groups + g]! + (li - start);
            outKeys[dest] = keys[src]!;
            outValues[dest] = values[src]!;
        });
    }
    return [outKeys, outValues];
}

describe('RadixSort — validação', () => {
    it('capacity inválida → RangeError', () => {
        const { core } = fakeResourceCore();
        expect(() => new RadixSort(core, { discriminator: 'x', capacity: 0 })).toThrow(RangeError);
    });

    it.each([0, 3, 6, 36, 2.5])('bits = %s → RangeError', (bits) => {
        const { sort } = setup(100);
        expect(() => {
            sort.record(recordingFrame().frame, { keys: buffer('k'), count: 10, bits });
        }).toThrow(/bits/);
    });

    it('count > capacity → RangeError; count = 0 não grava', () => {
        const { sort } = setup(100);
        expect(() => {
            sort.record(recordingFrame().frame, { keys: buffer('k'), count: 101 });
        }).toThrow(/capacidade/);
        const rec = recordingFrame();
        sort.record(rec.frame, { keys: buffer('k'), count: 0 });
        expect(rec.passes).toHaveLength(0);
    });

    it('values exige withValues, e withValues exige values', () => {
        expect(() => {
            setup(100).sort.prepare(buffer('k'), buffer('v'));
        }).toThrow(/withValues/);
        expect(() => {
            setup(100).sort.record(recordingFrame().frame, {
                keys: buffer('k'),
                values: buffer('v'),
                count: 10,
            });
        }).toThrow(/withValues/);
        expect(() => {
            setup(100, true).sort.record(recordingFrame().frame, { keys: buffer('k'), count: 10 });
        }).toThrow(/values/);
    });
});

describe('RadixSort — duas fases', () => {
    it('chaves não preparadas → erro; a gravação não cria objetos de GPU', () => {
        const { sort, core } = setup(1000);
        expect(() => {
            sort.record(recordingFrame().frame, { keys: buffer('outra'), count: 10 });
        }).toThrow(/prepare/);
        const created = (core.create as unknown as { mock: { calls: unknown[] } }).mock.calls
            .length;
        sort.record(recordingFrame().frame, { keys: buffer('k'), count: 1000 });
        expect((core.create as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(
            created,
        );
    });
});

describe('RadixSort — gravação', () => {
    it.each([
        [32, 8],
        [8, 2],
        [12, 3],
        [4, 1],
    ])('bits = %i → %i passes de histograma, soma de prefixos e espalhamento', (bits, passes) => {
        const { sort } = setup(1000);
        const rec = recordingFrame();
        sort.record(rec.frame, { keys: buffer('k'), count: 1000, bits });
        const expected = Array.from({ length: passes }, () => [
            'RadixSort.histogram',
            'scan',
            'RadixSort.scatter',
        ]).flat();
        expect(outline(rec.passes.map((p) => p.label))).toEqual(expected);
        expect(rec.passes.find((p) => p.label === 'RadixSort.histogram')?.dispatches[0]).toEqual([
            1000, 256,
        ]);
    });

    it('pingue-pongue termina nas chaves do chamador: cópia de volta só com passes ímpares', () => {
        const even = recordingFrame();
        setup(1000).sort.record(even.frame, { keys: buffer('k'), count: 1000, bits: 8 });
        expect(even.copies).toBe(0);
        const odd = recordingFrame();
        setup(1000).sort.record(odd.frame, { keys: buffer('k'), count: 1000, bits: 12 });
        expect(odd.copies).toBe(1);
        const oddValues = recordingFrame();
        setup(1000, true).sort.record(oddValues.frame, {
            keys: buffer('k'),
            values: buffer('v'),
            count: 1000,
            bits: 4,
        });
        expect(oddValues.copies).toBe(2);
    });

    it('um deslocamento de dígito por passe, cada um na sua região de parâmetros', () => {
        const { sort, writes } = setup(1000);
        sort.record(recordingFrame().frame, { keys: buffer('k'), count: 1000, bits: 12 });
        const radix = writes
            .filter((w) =>
                (w.spec as { discriminator: string }).discriminator.startsWith('rs:radix:'),
            )
            .map((w) => [w.offset, ...new Uint32Array(w.bytes.buffer, w.bytes.byteOffset, 3)]);
        expect(radix).toEqual([
            [0, 1000, 0, 4],
            [256, 1000, 4, 4],
            [512, 1000, 8, 4],
        ]);
    });
});

describe('RadixSort — referência do algoritmo', () => {
    let seed = 7;
    const rand = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed;
    };

    it.each([
        ['aleatórias', () => rand()],
        ['todas iguais', () => 42],
        ['poucos valores (estabilidade)', () => rand() % 7],
    ])('chaves %s: ordenadas e estáveis', (_, gen) => {
        const n = 1000;
        let keys: Uint32Array = Uint32Array.from({ length: n }, gen);
        let values: Uint32Array = Uint32Array.from({ length: n }, (_, i) => i);
        const original = keys.slice();
        for (let shift = 0; shift < 32; shift += 4) [keys, values] = radixPass(keys, values, shift);
        const expected = Array.from(original.keys()).sort(
            (a, b) => original[a]! - original[b]! || a - b,
        );
        expect(Array.from(values)).toEqual(expected);
        expect(Array.from(keys)).toEqual(expected.map((i) => original[i]!));
    });
});
