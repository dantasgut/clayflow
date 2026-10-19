import { describe, expect, it, vi } from 'vitest';
import { NeighborSearchPipeline } from '../NeighborSearchPipeline';
import { fakeResourceCore } from '../../../scene/__tests__/helpers/fakeResourceCore';
import { recordingFrame } from '../../physics/__tests__/helpers/recordingFrame';
import type { StorageBufferSpec } from '../../../scene/contracts/gpu';

function setup(gridDim: [number, number, number]) {
    const { core } = fakeResourceCore();
    const ns = new NeighborSearchPipeline(core, {
        discriminator: 'test',
        maxParticles: 1024,
        maxNeighbors: 16,
        particleStrideF32: 16,
        gridDim,
    });
    const particles: StorageBufferSpec = {
        kind: 'buffer',
        subkind: 'storage',
        discriminator: 'particles',
        byteSize: 1024 * 64,
    };
    const live: StorageBufferSpec = {
        kind: 'buffer',
        subkind: 'storage',
        discriminator: 'particles:live',
        byteSize: 128,
    };
    return { core, ns, particles, live };
}

const disc = (spec: unknown): string => (spec as { discriminator: string }).discriminator;

describe('NeighborSearchPipeline', () => {
    it('maxNeighbors fora de [1, 128] → RangeError', () => {
        const { core } = fakeResourceCore();
        const options = { discriminator: 'x', maxParticles: 8, particleStrideF32: 16 };
        expect(() => new NeighborSearchPipeline(core, { ...options, maxNeighbors: 0 })).toThrow(
            RangeError,
        );
        expect(() => new NeighborSearchPipeline(core, { ...options, maxNeighbors: 129 })).toThrow(
            RangeError,
        );
    });

    it('sequência: contagem, soma de prefixos das células (PrefixSum), espalhamento, ordenação das células e busca', () => {
        const { ns, particles, live } = setup([64, 64, 64]);
        const rec = recordingFrame();
        ns.prepare(particles, live);
        ns.rebuild(rec.frame, 100);
        // As 64³ células e a de fora da grade (spec 034: as partículas fora dela também entram na ordem por célula).
        expect(rec.passes.map((p) => [p.label, p.dispatches[0]])).toEqual([
            ['NS.assign_count', [100, 64]],
            ['PrefixSum.scan_local', [262_145, 256]],
            ['PrefixSum.scan_local', [1025, 256]],
            ['PrefixSum.scan_top', [1]],
            ['PrefixSum.scan_combine', [1025, 256]],
            ['PrefixSum.scan_combine', [262_145, 256]],
            ['NS.scatter', [100, 64]],
            ['NS.sort_cells', [262_145, 64]],
            ['NS.find', [100, 64]],
        ]);
        // cellCount → cellStart (o scan roda no lugar em cellStart) e cellStart → cellCursor.
        expect(rec.copies).toBe(2);
    });

    it('zera contagens no fluxo de comandos a cada reconstrução', () => {
        const { ns, particles, live } = setup([16, 16, 16]);
        const rec = recordingFrame();
        ns.prepare(particles, live, 2);
        ns.rebuild(rec.frame, 10);
        ns.rebuild(rec.frame, 10);
        expect(rec.sequence.filter((s) => s.startsWith('clear:'))).toEqual([
            'clear:ns_cell_count:test@0',
            'clear:ns_ncount:test@0',
            'clear:ns_cell_count:test@0',
            'clear:ns_ncount:test@0',
        ]);
    });

    it('particleCount = 0 não grava nada', () => {
        const { ns, particles, live } = setup([16, 16, 16]);
        const rec = recordingFrame();
        ns.prepare(particles, live);
        ns.rebuild(rec.frame, 0);
        expect(rec.passes).toHaveLength(0);
    });

    it('rebuild sem prepare → erro; a gravação não cria objetos de GPU', () => {
        const { ns, core, particles, live } = setup([16, 16, 16]);
        expect(() => {
            ns.rebuild(recordingFrame().frame, 10);
        }).toThrow(/prepare/);
        ns.prepare(particles, live, 3);
        const created = vi.mocked(core.create).mock.calls.length;
        const rec = recordingFrame();
        for (let i = 0; i < 3; i++) ns.rebuild(rec.frame, 10);
        expect(vi.mocked(core.create).mock.calls.length).toBe(created);
    });

    it('prepare com outro buffer de partículas refaz só os kernels que o ligam', () => {
        const { ns, core, particles, live } = setup([16, 16, 16]);
        ns.prepare(particles, live);
        const other: StorageBufferSpec = { ...particles, discriminator: 'particles2' };
        ns.prepare(other, live);
        const destroyed = vi.mocked(core.destroy).mock.calls.map((c) => disc(c[0]));
        expect(destroyed.filter((d) => d.endsWith('_pipeline'))).toEqual([
            'ns_assign:test_pipeline',
            'ns_find:test_pipeline',
            'ns_sort_cells:test_pipeline',
        ]);
    });

    it('dispose libera os buffers da busca e os da soma de prefixos', () => {
        const { ns, core, particles, live } = setup([64, 64, 64]);
        ns.prepare(particles, live);
        ns.rebuild(recordingFrame().frame, 100);
        ns.dispose();
        const destroyed = (
            core.destroy as unknown as { mock: { calls: unknown[][] } }
        ).mock.calls.map((c) => disc(c[0]));
        expect(destroyed.filter((d) => d.startsWith('ns_scan:test:scan_level:'))).toHaveLength(2);
        expect(destroyed).toContain('ns_cell_start:test');
        expect(destroyed).toContain('ns_nlist:test');
    });
});
