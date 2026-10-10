import { describe, expect, it } from 'vitest';
import { NeighborSearchPipeline, scanLevelCounts } from '../NeighborSearchPipeline';
import { fakeResourceCore } from '../../../scene/__tests__/helpers/fakeResourceCore';
import { recordingFrame } from '../../physics/__tests__/helpers/recordingFrame';
import type { StorageBufferSpec } from '../../../core/contracts/index';

/** Grade cúbica com `cells` células (dimensões fatoradas em potências de 2). */
function gridFor(cells: number): [number, number, number] {
    const side = Math.round(Math.cbrt(cells));
    if (side ** 3 === cells) return [side, side, side];
    return [cells / 64, 8, 8];
}

function setup(cells: number) {
    const { core, writes } = fakeResourceCore();
    const ns = new NeighborSearchPipeline(core, {
        discriminator: 'test',
        maxParticles: 1024,
        maxNeighbors: 16,
        particleStrideF32: 16,
        gridDim: gridFor(cells),
    });
    const particles: StorageBufferSpec = {
        kind: 'buffer',
        subkind: 'storage',
        discriminator: 'particles',
        byteSize: 1024 * 64,
    };
    return { core, writes, ns, particles };
}

const disc = (spec: unknown): string => (spec as { discriminator: string }).discriminator;

/**
 * Referência na CPU do algoritmo da GPU: soma exclusiva por grupo de 256, totais por grupo subindo nível a
 * nível até caber num grupo, e a descida somando o prefixo do grupo.
 */
function exclusiveScanByLevels(values: Uint32Array): Uint32Array {
    const scanLocal = (src: Uint32Array): { dst: Uint32Array; sums: Uint32Array } => {
        const groups = Math.ceil(src.length / 256);
        const dst = new Uint32Array(src.length);
        const sums = new Uint32Array(groups);
        for (let g = 0; g < groups; g++) {
            let acc = 0;
            for (let k = g * 256; k < Math.min(src.length, (g + 1) * 256); k++) {
                dst[k] = acc;
                acc += src[k]!;
            }
            sums[g] = acc;
        }
        return { dst, sums };
    };
    const levels: Uint32Array[] = [];
    let current = values;
    let sums: Uint32Array;
    do {
        const r = scanLocal(current);
        levels.push(r.dst);
        sums = r.sums;
        current = sums;
    } while (sums.length > 256);
    // topo: exclusiva num grupo
    const top = scanLocal(sums).dst;
    let prefix = top;
    for (let l = levels.length - 1; l >= 0; l--) {
        const dst = levels[l]!;
        for (let i = 0; i < dst.length; i++) dst[i] = dst[i]! + prefix[Math.floor(i / 256)]!;
        prefix = dst;
    }
    return levels[0]!;
}

describe('NeighborSearchPipeline — soma de prefixos em vários níveis (R17)', () => {
    it.each([
        [256, [256, 1]],
        [4096, [4096, 16]],
        [65_536, [65_536, 256]],
        [131_072, [131_072, 512, 2]],
        [262_144, [262_144, 1024, 4]],
        [16_777_216, [16_777_216, 65_536, 256]],
    ])('%i células → contagens por nível %j', (cells, counts) => {
        expect(scanLevelCounts(cells)).toEqual(counts);
    });

    it('um buffer de somas por nível, escrito nos uniforms só na alocação', () => {
        const { ns, writes, particles } = setup(262_144);
        ns.allocate();
        const levelWrites = writes.filter((w) => disc(w.spec).startsWith('ns_scan_level:'));
        expect(levelWrites.map((w) => new Uint32Array(w.bytes.buffer)[0])).toEqual([
            262_144, 1024, 4,
        ]);
        const before = writes.length;
        const rec = recordingFrame();
        ns.rebuild(rec.frame, particles, 100);
        ns.rebuild(rec.frame, particles, 100);
        expect(
            writes.slice(before).filter((w) => disc(w.spec).startsWith('ns_scan_level:')),
        ).toHaveLength(0);
    });

    it('sequência: scan_local subindo, scan_groups no topo, scan_combine descendo', () => {
        const { ns, particles } = setup(262_144);
        const rec = recordingFrame();
        ns.rebuild(rec.frame, particles, 100);
        const scan = rec.passes
            .filter((p) => p.label.startsWith('NS.scan'))
            .map((p) => [p.label, p.dispatches[0]]);
        expect(scan).toEqual([
            ['NS.scan_local', [262_144, 256]],
            ['NS.scan_local', [1024, 256]],
            ['NS.scan_groups', [1]],
            ['NS.scan_combine', [1024, 256]],
            ['NS.scan_combine', [262_144, 256]],
        ]);
    });

    it('partículas despachadas por invocations(count, 64)', () => {
        const { ns, particles } = setup(4096);
        const rec = recordingFrame();
        ns.rebuild(rec.frame, particles, 100);
        for (const label of ['NS.assign_count', 'NS.scatter', 'NS.find']) {
            expect(rec.passes.find((p) => p.label === label)?.dispatches[0]).toEqual([100, 64]);
        }
    });

    it('dispose destrói os buffers de todos os níveis', () => {
        const { ns, core } = setup(262_144);
        ns.allocate();
        ns.dispose();
        const destroyed = (core.destroy as unknown as { mock: { calls: unknown[][] } }).mock.calls
            .map((c) => disc(c[0]))
            .filter((d) => d.startsWith('ns_scan_'));
        expect(destroyed.filter((d) => d.startsWith('ns_scan_sums:'))).toHaveLength(2);
        expect(destroyed.filter((d) => d.startsWith('ns_scan_partial:'))).toHaveLength(1);
        expect(destroyed.filter((d) => d.startsWith('ns_scan_level:'))).toHaveLength(3);
    });

    it('referência CPU do algoritmo = soma de prefixos sequencial (262 144 contagens)', () => {
        let seed = 12345;
        const values = new Uint32Array(262_144).map(() => {
            seed = (seed * 1103515245 + 12345) >>> 0;
            return seed % 5;
        });
        const expected = new Uint32Array(values.length);
        let acc = 0;
        for (let i = 0; i < values.length; i++) {
            expected[i] = acc;
            acc += values[i]!;
        }
        expect(exclusiveScanByLevels(values)).toEqual(expected);
    });
});
