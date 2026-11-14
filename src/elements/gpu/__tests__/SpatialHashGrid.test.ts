/**
 * Grade hash espacial (`SpatialHashGrid`, spec 007): tamanho da tabela, preparação em duas fases (buffers e kernels
 * recriados só quando mudam, parâmetros escritos), sequência gravada e o hash/célula de referência que o WGSL usa.
 */
import { describe, expect, it } from 'vitest';
import { SpatialHashGrid, hashTableSize } from '../compute/SpatialHashGrid';
import { HashGridParamsSchema } from '../compute/schemas';
import { workHarness } from './helpers/workHarness';
import { recordingFrame } from '../../physics/__tests__/helpers/recordingFrame';
import type { StorageBufferSpec } from '../../../scene/contracts/gpu';

const items: StorageBufferSpec = {
    kind: 'buffer',
    subkind: 'storage',
    discriminator: 'proxies',
    byteSize: 1 << 16,
};
function setup() {
    const h = workHarness();
    const grid = new SpatialHashGrid(h.ctx, { discriminator: 'g' });
    return { ...h, grid };
}

/** Referência na CPU de `sh_cell`/`sh_hash` (spatial_hash.wgsl). */
function hashOf(p: readonly [number, number, number], cellSize: number, mask: number): number {
    const c = p.map((v) => Math.floor(v / cellSize) | 0);
    const h =
        (Math.imul(c[0]! >>> 0, 73856093) >>> 0)
        ^ (Math.imul(c[1]! >>> 0, 19349663) >>> 0)
        ^ (Math.imul(c[2]! >>> 0, 83492791) >>> 0);
    return (h >>> 0) & mask;
}

describe('SpatialHashGrid (spec 007)', () => {
    it('tabela: potência de 2, pelo menos 1024 e ≥ 2 × itens', () => {
        expect(hashTableSize(0)).toBe(1024);
        expect(hashTableSize(512)).toBe(1024);
        expect(hashTableSize(513)).toBe(2048);
        expect(hashTableSize(10_000)).toBe(32_768);
    });

    it('prepare declara tabela e itens no trabalho, envia os parâmetros e só realoca o que muda', () => {
        const s = setup();
        expect(s.grid.prepare(items, 100, 0.5)).toBe(true);
        expect(s.grid.cellStart.byteSize).toBe(1024 * 4);
        expect(s.grid.cellItems.byteSize).toBe(100 * 4);
        const firstStart = s.grid.cellStart;
        const firstItems = s.grid.cellItems;
        s.frame(); // os parâmetros vão no envio dos sujos
        const bytes = s.bytesOf(s.grid.params);
        const u32 = new Uint32Array(bytes.buffer, bytes.byteOffset, 4);
        const f32 = new Float32Array(bytes.buffer, bytes.byteOffset, 4);
        expect(u32[HashGridParamsSchema.offsetOf('count') / 4]).toBe(100);
        expect(u32[HashGridParamsSchema.offsetOf('table_mask') / 4]).toBe(1023);
        expect(f32[HashGridParamsSchema.offsetOf('cell_size') / 4]).toBe(0.5);
        expect(s.grid.prepare(items, 200, 0.5)).toBe(true); // capacidade dos itens cresce (200 > 100)
        expect(s.grid.cellItems).not.toBe(firstItems);
        expect(s.core.destroy).toHaveBeenCalledWith(firstItems);
        expect(s.grid.cellStart).toBe(firstStart); // a tabela não mudou: a C2 mantém o buffer
        expect(s.grid.prepare(items, 150, 0.7)).toBe(false);
        expect(s.grid.prepare(items, 600, 0.7)).toBe(true); // tabela 2048
        expect(s.grid.cellStart.byteSize).toBe(2048 * 4);
        expect(s.core.destroy).toHaveBeenCalledWith(firstStart);
    });

    it('record grava: zera contagens, conta, soma prefixos, copia cursores e espalha; sem itens, nada', () => {
        const s = setup();
        s.grid.prepare(items, 0, 1);
        const empty = recordingFrame();
        s.grid.record(empty.frame);
        expect(empty.sequence).toEqual([]);
        s.grid.prepare(items, 50, 1);
        const rec = recordingFrame();
        s.grid.record(rec.frame);
        expect(rec.sequence[0]).toMatch(/^clear:g:counts:/);
        expect(rec.sequence[1]).toBe('pass:SpatialHashGrid.count');
        expect(rec.sequence).toContain('pass:PrefixSum.scan_top');
        expect(rec.sequence.at(-1)).toBe('pass:SpatialHashGrid.scatter');
        expect(rec.copies).toBe(2); // counts → starts (scan fora do lugar) e starts → cursores
    });

    it('referência do hash: células vizinhas caem em baldes da tabela e coordenadas negativas são válidas', () => {
        const mask = 1023;
        const a = hashOf([0.1, 0.1, 0.1], 1, mask);
        const b = hashOf([-0.1, 0.1, 0.1], 1, mask);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(mask);
        expect(b).toBeLessThanOrEqual(mask);
        expect(a).not.toBe(b);
        expect(hashOf([0.9, 0.2, 0.3], 1, mask)).toBe(a); // mesma célula
    });

    it('destroy solta tabela, itens e níveis da soma (a C2 os libera)', () => {
        const s = setup();
        s.grid.prepare(items, 10, 1);
        const own = [s.grid.cellCount, s.grid.cellStart, s.grid.cellItems];
        const level = s.resources.bufferOf(s.work, 'g:scan:scan_level:1');
        s.grid.destroy();
        for (const spec of [...own, level]) expect(s.core.destroy).toHaveBeenCalledWith(spec);
        expect(s.resources.bufferOf(s.work, 'g:counts')).toBeUndefined();
        expect(() => s.grid.cellStart).toThrow(/prepare/);
    });
});
