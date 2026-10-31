import { describe, expect, it, vi } from 'vitest';
import { NeighborSearchPipeline } from '../NeighborSearchPipeline';
import { recordingFrame } from '../../physics/__tests__/helpers/recordingFrame';
import type { StorageBufferSpec } from '../../../scene/contracts/gpu';
import { workHarness } from './helpers/workHarness';

function setup(gridDim: [number, number, number]) {
    const h = workHarness();
    const { core } = h;
    const ns = new NeighborSearchPipeline(h.ctx, {
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
    /** Discriminador do buffer que a C2 alocou para o descritor `name` da busca. */
    const own = (name: string): string => disc(h.resources.bufferOf(h.work, `ns:test:${name}`));
    return { ...h, core, ns, particles, live, own };
}

const disc = (spec: unknown): string => (spec as { discriminator: string }).discriminator;

describe('NeighborSearchPipeline', () => {
    it('maxNeighbors fora de [1, 128] → RangeError', () => {
        const { ctx } = workHarness();
        const options = { discriminator: 'x', maxParticles: 8, particleStrideF32: 16 };
        expect(() => new NeighborSearchPipeline(ctx, { ...options, maxNeighbors: 0 })).toThrow(
            RangeError,
        );
        expect(() => new NeighborSearchPipeline(ctx, { ...options, maxNeighbors: 129 })).toThrow(
            RangeError,
        );
    });

    it('sequência: contagem, soma de prefixos das células (PrefixSum), espalhamento, ordenação das células e busca', () => {
        const { ns, particles, live } = setup([64, 64, 64]);
        const rec = recordingFrame();
        ns.prepare(particles, live);
        ns.rebuild(rec.frame, 100);
        expect(rec.passes.map((p) => [p.label, p.dispatches[0]])).toEqual([
            // As 64³ células da grade e a extra das partículas fora dela.
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
        const { ns, particles, live, own } = setup([16, 16, 16]);
        const rec = recordingFrame();
        ns.prepare(particles, live, 2);
        ns.rebuild(rec.frame, 10);
        ns.rebuild(rec.frame, 10);
        const once = ['cell_count', 'ncount', 'order'].map((n) => `clear:${own(n)}@0`);
        expect(rec.sequence.filter((s) => s.startsWith('clear:'))).toEqual([...once, ...once]);
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

    it('os buffers da busca e os da soma de prefixos são do trabalho: a C2 os libera quando ele sai da cena', () => {
        const { ns, core, particles, live, own, world, work } = setup([64, 64, 64]);
        ns.prepare(particles, live);
        ns.rebuild(recordingFrame().frame, 100);
        const cellStart = own('cell_start');
        const nlist = own('nlist');
        ns.dispose();
        world.remove(work);
        const destroyed = (
            core.destroy as unknown as { mock: { calls: unknown[][] } }
        ).mock.calls.map((c) => disc(c[0]));
        expect(destroyed.filter((d) => d.startsWith('ns_scan:test:scan_level:'))).toHaveLength(2);
        expect(destroyed).toContain(cellStart);
        expect(destroyed).toContain(nlist);
    });
});
