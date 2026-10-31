import { describe, expect, it } from 'vitest';
import { Compaction } from '../compute/Compaction';
import { compactionModules } from '../compute/shaders';
import { wgslModule } from '../../../scene/shaders/WgslModule';
import { wgslResource } from '../../../scene/shaders/WgslResource';
import { composeWgsl } from '../../../scene/shaders/composeWgsl';
import { recordingFrame } from '../../physics/__tests__/helpers/recordingFrame';
import type { StorageBufferSpec } from '../../../scene/contracts/gpu';
import { workHarness } from './helpers/workHarness';

const buffer = (discriminator: string): StorageBufferSpec => ({
    kind: 'buffer',
    subkind: 'storage',
    discriminator,
    byteSize: 1 << 16,
});

const testValues = wgslResource({
    name: 'test_values',
    binding: { storage: 'read' },
    type: { wgsl: 'u32', array: true },
    frequency: 'stage',
    provider: 'private',
});

const predicate = wgslModule({
    name: 'test_even',
    requires: [testValues],
    source: `
fn compact_keep(i: u32) -> bool { return (test_values[i] & 1u) == 0u; }
fn compact_value(i: u32) -> u32 { return i; }`,
});

const out = buffer('out');
const ctr = buffer('ctr');

function setup(options: { stable?: boolean; inputCapacity?: number } = {}) {
    const h = workHarness();
    const compaction = new Compaction(h.ctx, {
        discriminator: 'cp',
        predicate,
        capacity: 100,
        bindings: new Map([[testValues, buffer('values')]]),
        ...options,
    });
    return { ...h, compaction };
}

describe('Compaction', () => {
    it('predicado sem compact_keep/compact_value → erro na criação', () => {
        const bad = wgslModule({
            name: 'bad',
            source: 'fn compact_keep(i: u32) -> bool { return true; }',
        });
        expect(() => compactionModules(bad)).toThrow(/compact_value/);
    });

    it('módulos memorizados por predicado e montáveis (referências resolvidas)', () => {
        const a = compactionModules(predicate);
        expect(compactionModules(predicate)).toBe(a);
        for (const m of [a.atomic, a.flags, a.scatter]) {
            expect(() => composeWgsl(m)).not.toThrow();
        }
        expect(composeWgsl(a.atomic).spec.source).toContain('fn atomic_alloc');
    });

    it('stable sem inputCapacity → RangeError', () => {
        expect(() => setup({ stable: true })).toThrow(/inputCapacity/);
    });

    it('modo atômico: zera o contador e grava um passe', () => {
        const { compaction } = setup();
        const rec = recordingFrame();
        compaction.prepare(out, ctr);
        compaction.record(rec.frame, { count: 1000, out, counter: ctr });
        expect(rec.sequence).toEqual(['clear:ctr', 'pass:Compaction.atomic']);
        expect(rec.passes[0]!.dispatches[0]).toEqual([1000, 256]);
        // grupo 0 com offset dinâmico; grupo 1 com os buffers do predicado.
        expect(rec.passes[0]!.offsets).toEqual([undefined, [0]]);
    });

    it('modo estável: flags, soma de prefixos (PrefixSum) e espalhamento', () => {
        const { compaction } = setup({ stable: true, inputCapacity: 70_000 });
        const rec = recordingFrame();
        compaction.prepare(out, ctr);
        compaction.record(rec.frame, { count: 70_000, out, counter: ctr });
        expect(rec.sequence).toEqual([
            'clear:ctr',
            'pass:Compaction.flags',
            'pass:PrefixSum.scan_local',
            'pass:PrefixSum.scan_local',
            'pass:PrefixSum.scan_top',
            'pass:PrefixSum.scan_combine',
            'pass:PrefixSum.scan_combine',
            'pass:Compaction.scatter',
        ]);
    });

    it('modo estável: as flags são um descritor do trabalho (inputCapacity palavras); destroy as solta', () => {
        const { compaction, resources, work, core } = setup({ stable: true, inputCapacity: 1000 });
        compaction.prepare(out, ctr);
        const flags = resources.bufferOf(work, 'cp:compact_flags');
        expect(flags?.byteSize).toBe(1000 * 4);
        compaction.destroy();
        expect(core.destroy).toHaveBeenCalledWith(flags);
        expect(resources.bufferOf(work, 'cp:compact_flags')).toBeUndefined();
    });

    it('count = 0 só zera o contador; count acima de inputCapacity → RangeError', () => {
        const { compaction } = setup({ stable: true, inputCapacity: 10 });
        const rec = recordingFrame();
        compaction.prepare(out, ctr);
        compaction.record(rec.frame, { count: 0, out, counter: ctr });
        expect(rec.sequence).toEqual(['clear:ctr']);
        expect(() => {
            compaction.record(rec.frame, { count: 11, out, counter: ctr });
        }).toThrow(RangeError);
    });

    it('gravar sem prepare → erro; segunda gravação no quadro sem região reservada → RangeError', () => {
        const { compaction } = setup();
        const rec = recordingFrame();
        expect(() => {
            compaction.record(rec.frame, { count: 5, out, counter: ctr });
        }).toThrow(/prepare/);
        compaction.prepare(out, ctr);
        compaction.record(rec.frame, { count: 5, out, counter: ctr });
        expect(() => {
            compaction.record(rec.frame, { count: 5, out, counter: ctr });
        }).toThrow(/reserve/);
        compaction.prepare(out, ctr, 2);
        const next = recordingFrame();
        compaction.record(next.frame, { count: 5, out, counter: ctr });
        compaction.record(next.frame, { count: 5, out, counter: ctr });
    });
});
