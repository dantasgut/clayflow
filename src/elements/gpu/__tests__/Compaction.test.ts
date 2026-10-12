import { describe, expect, it } from 'vitest';
import { Compaction } from '../compute/Compaction';
import { compactionModules } from '../compute/shaders';
import { wgslModule } from '../../../scene/shaders/WgslModule';
import { composeWgsl } from '../../../scene/shaders/composeWgsl';
import { fakeResourceCore } from '../../../scene/__tests__/helpers/fakeResourceCore';
import { recordingFrame } from '../../physics/__tests__/helpers/recordingFrame';
import type { StorageBufferSpec } from '../../../core/contracts/index';

const buffer = (discriminator: string): StorageBufferSpec => ({
    kind: 'buffer',
    subkind: 'storage',
    discriminator,
    byteSize: 1 << 16,
});

const predicate = wgslModule({
    name: 'test_even',
    source: `
@group(1) @binding(0) var<storage, read> test_values: array<u32>;
fn compact_keep(i: u32) -> bool { return (test_values[i] & 1u) == 0u; }
fn compact_value(i: u32) -> u32 { return i; }`,
});

const out = buffer('out');
const ctr = buffer('ctr');

function setup(options: { stable?: boolean; inputCapacity?: number } = {}) {
    const { core } = fakeResourceCore();
    const compaction = new Compaction(core, {
        discriminator: 'cp',
        predicate,
        capacity: 100,
        bindings: { test_values: buffer('values') },
        ...options,
    });
    return { core, compaction };
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
        expect(rec.passes[0]!.offsets).toEqual([[0], undefined]);
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
