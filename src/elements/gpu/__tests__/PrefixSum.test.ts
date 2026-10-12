import { describe, expect, it } from 'vitest';
import { PrefixSum, scanLevelCounts } from '../compute/PrefixSum';
import { fakeResourceCore } from '../../../scene/__tests__/helpers/fakeResourceCore';
import { recordingFrame } from '../../physics/__tests__/helpers/recordingFrame';
import type { StorageBufferSpec } from '../../../core/contracts/index';

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

const disc = (spec: unknown): string => (spec as { discriminator: string }).discriminator;

function setup(capacity: number) {
    const { core, writes } = fakeResourceCore();
    const scan = new PrefixSum(core, { discriminator: 'ps', capacity });
    const created = () =>
        (core.create as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => c[0]);
    const destroyed = () =>
        (core.destroy as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) =>
            disc(c[0]),
        );
    return { core, writes, scan, created, destroyed };
}

/** Pares (count, inclusive) gravados nas regiões de parâmetros, na ordem. */
function levelWrites(writes: ReturnType<typeof fakeResourceCore>['writes']) {
    return writes
        .filter((w) => disc(w.spec).includes(':frame_uniforms:'))
        .map((w) => {
            const u = new Uint32Array(w.bytes.buffer, w.bytes.byteOffset, 2);
            return { offset: w.offset, count: u[0], inclusive: u[1] };
        });
}

/**
 * Referência na CPU do algoritmo da GPU: soma por grupo de 256 no lugar, totais por grupo subindo nível a nível até
 * caber num grupo, e a descida somando o prefixo exclusivo do grupo.
 */
function scanByLevels(values: Uint32Array, inclusive: boolean): Uint32Array {
    const local = (vals: Uint32Array, incl: boolean): Uint32Array => {
        const sums = new Uint32Array(Math.ceil(vals.length / 256));
        for (let g = 0; g < sums.length; g++) {
            let acc = 0;
            for (let k = g * 256; k < Math.min(vals.length, (g + 1) * 256); k++) {
                const v = vals[k]!;
                acc += v;
                vals[k] = incl ? acc : acc - v;
            }
            sums[g] = acc;
        }
        return sums;
    };
    const levels: Uint32Array[] = [values.slice()];
    const counts = scanLevelCounts(values.length);
    for (let k = 0; k < counts.length - 1; k++)
        levels.push(local(levels[k]!, inclusive && k === 0));
    local(levels[counts.length - 1]!, false);
    for (let k = counts.length - 2; k >= 0; k--) {
        const vals = levels[k]!;
        for (let i = 0; i < vals.length; i++)
            vals[i] = vals[i]! + levels[k + 1]![Math.floor(i / 256)]!;
    }
    return levels[0]!;
}

describe('PrefixSum — níveis', () => {
    it.each([
        [1, [1, 1]],
        [256, [256, 1]],
        [257, [257, 2]],
        [65_536, [65_536, 256]],
        [65_537, [65_537, 257, 2]],
        [262_144, [262_144, 1024, 4]],
        [16_777_216, [16_777_216, 65_536, 256]],
    ])('%i elementos → contagens por nível %j', (count, counts) => {
        expect(scanLevelCounts(count)).toEqual(counts);
    });

    it('buffers dos níveis acima do 0 dimensionados pela capacidade', () => {
        const { scan, created } = setup(262_144);
        scan.prepare(buffer('a'));
        scan.record(recordingFrame().frame, { src: buffer('a'), dst: buffer('a'), count: 10 });
        const levels = created()
            .filter((s) => disc(s).startsWith('ps:scan_level:'))
            .map((s) => [disc(s), (s as StorageBufferSpec).byteSize]);
        expect(levels).toEqual([
            ['ps:scan_level:1', 1024 * 4],
            ['ps:scan_level:2', 16],
        ]);
    });
});

describe('PrefixSum — validação', () => {
    it('capacity inválida → RangeError', () => {
        const { core } = fakeResourceCore();
        expect(() => new PrefixSum(core, { discriminator: 'x', capacity: 0 })).toThrow(RangeError);
        expect(() => new PrefixSum(core, { discriminator: 'x', capacity: 1.5 })).toThrow(
            RangeError,
        );
    });

    it('count > capacity → RangeError', () => {
        const { scan } = setup(100);
        expect(() => {
            scan.record(recordingFrame().frame, { src: buffer('a'), dst: buffer('b'), count: 101 });
        }).toThrow(/capacidade/);
    });

    it('count = 0 não grava passe, cópia nem parâmetro', () => {
        const { scan, writes } = setup(100);
        const rec = recordingFrame();
        scan.record(rec.frame, { src: buffer('a'), dst: buffer('b'), count: 0 });
        expect(rec.passes).toHaveLength(0);
        expect(rec.copies).toBe(0);
        expect(writes).toHaveLength(0);
    });
});

describe('PrefixSum — gravação', () => {
    it('sequência: scan_local subindo, scan_top no topo, scan_combine descendo', () => {
        const { scan } = setup(262_144);
        const rec = recordingFrame();
        scan.prepare(buffer('a'));
        scan.record(rec.frame, { src: buffer('a'), dst: buffer('a'), count: 262_144 });
        expect(rec.passes.map((p) => [p.label, p.dispatches[0]])).toEqual([
            ['PrefixSum.scan_local', [262_144, 256]],
            ['PrefixSum.scan_local', [1024, 256]],
            ['PrefixSum.scan_top', [1]],
            ['PrefixSum.scan_combine', [1024, 256]],
            ['PrefixSum.scan_combine', [262_144, 256]],
        ]);
    });

    it('níveis pela contagem da chamada, não pela capacidade', () => {
        const { scan } = setup(262_144);
        const rec = recordingFrame();
        scan.prepare(buffer('a'));
        scan.record(rec.frame, { src: buffer('a'), dst: buffer('a'), count: 300 });
        expect(rec.passes.map((p) => p.label)).toEqual([
            'PrefixSum.scan_local',
            'PrefixSum.scan_top',
            'PrefixSum.scan_combine',
        ]);
    });

    it('src ≠ dst copia antes; no lugar não copia', () => {
        const { scan } = setup(1000);
        scan.prepare(buffer('b'));
        scan.prepare(buffer('c'));
        const separate = recordingFrame();
        scan.record(separate.frame, { src: buffer('a'), dst: buffer('b'), count: 1000 });
        expect(separate.copies).toBe(1);
        const inPlace = recordingFrame();
        const same = buffer('c');
        scan.record(inPlace.frame, { src: same, dst: same, count: 1000 });
        expect(inPlace.copies).toBe(0);
    });

    it('modo inclusivo só no nível 0; cada nível com a sua região', () => {
        const { scan, writes } = setup(70_000);
        scan.prepare(buffer('a'));
        scan.record(recordingFrame().frame, {
            src: buffer('a'),
            dst: buffer('a'),
            count: 70_000,
            mode: 'inclusive',
        });
        expect(levelWrites(writes)).toEqual([
            { offset: 0, count: 70_000, inclusive: 1 },
            { offset: 256, count: 274, inclusive: 0 },
            { offset: 512, count: 2, inclusive: 0 },
        ]);
    });

    it('offset dinâmico de cada passe = região do seu nível', () => {
        const { scan } = setup(70_000);
        const rec = recordingFrame();
        scan.prepare(buffer('a'));
        scan.record(rec.frame, { src: buffer('a'), dst: buffer('a'), count: 70_000 });
        expect(rec.passes.map((p) => p.offsets[0]?.[0])).toEqual([0, 256, 512, 256, 0]);
    });

    it('duas chamadas no mesmo quadro usam regiões distintas; quadro novo recomeça da região 0', () => {
        const { scan, writes } = setup(1000);
        scan.prepare(buffer('a'), 2);
        scan.prepare(buffer('b'), 2);
        const rec = recordingFrame();
        scan.record(rec.frame, { src: buffer('a'), dst: buffer('a'), count: 1000 });
        scan.record(rec.frame, { src: buffer('b'), dst: buffer('b'), count: 10 });
        expect(levelWrites(writes).map((w) => [w.offset, w.count])).toEqual([
            [0, 1000],
            [256, 4],
            [512, 10],
            [768, 1],
        ]);
        scan.record(recordingFrame().frame, { src: buffer('a'), dst: buffer('a'), count: 7 });
        expect(
            levelWrites(writes)
                .slice(4)
                .map((w) => [w.offset, w.count]),
        ).toEqual([
            [0, 7],
            [256, 1],
        ]);
    });

    it('gravar sem prepare → erro; passar das regiões reservadas → RangeError (nada é criado na gravação)', () => {
        const { scan, core } = setup(10);
        expect(() => {
            scan.record(recordingFrame().frame, { src: buffer('a'), dst: buffer('a'), count: 10 });
        }).toThrow(/prepare/);
        scan.prepare(buffer('a'), 2);
        const created = (core.create as unknown as { mock: { calls: unknown[] } }).mock.calls
            .length;
        const rec = recordingFrame();
        scan.record(rec.frame, { src: buffer('a'), dst: buffer('a'), count: 10 });
        scan.record(rec.frame, { src: buffer('a'), dst: buffer('a'), count: 10 });
        expect((core.create as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(
            created,
        );
        expect(() => {
            scan.record(rec.frame, { src: buffer('a'), dst: buffer('a'), count: 10 });
        }).toThrow(/reserve/);
    });

    it('prepare com mais gravações por quadro recria o uniform e os kernels (fora da gravação)', () => {
        const { scan, destroyed } = setup(10);
        scan.prepare(buffer('a'), 1);
        scan.prepare(buffer('a'), 4);
        expect(destroyed().filter((d) => d.includes(':frame_uniforms:'))).toEqual([
            'ps:scan:frame_uniforms:1',
        ]);
        expect(destroyed().filter((d) => d.endsWith('_pipeline')).length).toBeGreaterThan(0);
        const rec = recordingFrame();
        for (let i = 0; i < 4; i++)
            scan.record(rec.frame, { src: buffer('a'), dst: buffer('a'), count: 10 });
    });

    it('destroy libera níveis e uniforms', () => {
        const { scan, destroyed } = setup(262_144);
        scan.prepare(buffer('a'));
        scan.record(recordingFrame().frame, { src: buffer('a'), dst: buffer('a'), count: 262_144 });
        scan.destroy();
        expect(destroyed().filter((d) => d.startsWith('ps:scan_level:'))).toHaveLength(2);
        expect(destroyed().filter((d) => d.includes(':frame_uniforms:'))).toHaveLength(1);
    });
});

describe('PrefixSum — referência do algoritmo', () => {
    let seed = 12345;
    const values = new Uint32Array(262_144 + 77).map(() => {
        seed = (seed * 1103515245 + 12345) >>> 0;
        return seed % 5;
    });

    it.each([false, true])('inclusiva = %s: igual à soma sequencial', (inclusive) => {
        const expected = new Uint32Array(values.length);
        let acc = 0;
        for (let i = 0; i < values.length; i++) {
            if (inclusive) acc += values[i]!;
            expected[i] = acc;
            if (!inclusive) acc += values[i]!;
        }
        expect(scanByLevels(values, inclusive)).toEqual(expected);
    });
});
