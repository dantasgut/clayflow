import { SET_GROUP } from '../../../scene/graph/GraphFlow';
import { defineSetNode } from '../../../scene/graph/SetNode';
import { Compaction } from '../../gpu/compute/Compaction';
import { CountToArgs } from '../../gpu/compute/CountToArgs';
import { PrefixSum } from '../../gpu/compute/PrefixSum';
import { RadixSort } from '../../gpu/compute/RadixSort';
import { Reduce } from '../../gpu/compute/Reduce';
import { AtomicAllocCounterSchema } from '../../gpu/compute/schemas';
import type { ReduceOpName } from '../../gpu/compute/shaders';
import { SequenceParamsSchema, SetAcceptedParamsSchema, U32S } from './schemas';
import { setAccepted, setCompactPredicate, setResources as R, setSequence } from './shaders';
import { SetNodeKernels } from './SetNodeKernels';

// As primitivas paralelas da C3 como nós de conjunto (spec 031, FR-027), sobre conjuntos u32 (`U32S`): a contagem da
// entrada vem do registro `SetCount` dela (da CPU ou da GPU) pela variante de contagem da GPU de cada primitiva, com o
// despacho pelo argumento indireto do mesmo registro — nada volta à CPU.

/** Contagem de `set.sequence` (inteiro ≥ 1). */
const sequenceCount = (v: unknown): number =>
    Math.max(1, Math.floor((v as number | undefined) ?? 1));

/**
 * `set.sequence`: conjunto u32 `start + i · step`, i < `count` (≥ 1, padrão 256) — a fonte dos nós das primitivas.
 * Contagem da CPU.
 */
export const sequence = defineSetNode({
    name: 'set.sequence',
    outputs: { values: U32S },
    params: {
        count: { type: 'u32', default: 256 },
        start: { type: 'u32', default: 0 },
        step: { type: 'u32', default: 1 },
    },
    capacity: ({ values }) => ({ 'values.values': sequenceCount(values.count) }),
    create: (c) => {
        const k = new SetNodeKernels(c, SequenceParamsSchema);
        k.kernel('sequence', setSequence, 'sequence_main', [
            [R.sequence, k.params],
            [R.u32Out, c.output('values', 'values').buffer],
        ]);
        let count = 0;
        return {
            update: () => {
                const v = c.values();
                count = sequenceCount(v.count);
                k.write({ count, start: v.start ?? 0, step: v.step ?? 1 });
            },
            record: (frame) => {
                k.direct(frame, 'set.sequence', 'sequence', count);
            },
            dispose: () => {
                k.dispose();
            },
        };
    },
});

/**
 * `set.prefixSum`: soma de prefixos (`PrefixSum`) do conjunto u32 — exclusiva, ou inclusiva com `inclusive` ≠ 0.
 * Contagem a da entrada.
 */
export const prefixSum = defineSetNode({
    name: 'set.prefixSum',
    inputs: { values: U32S },
    outputs: { values: U32S },
    params: { inclusive: { type: 'u32', default: 0 } },
    capacity: (c) => ({ 'values.values': c.input('values', 'values') }),
    counts: { 'values.values': { same: 'values.values' } },
    create: (c) => {
        const src = c.input('values', 'values');
        const dst = c.output('values', 'values');
        const scan = new PrefixSum(c.work, {
            discriminator: `${c.id}:scan`,
            capacity: src.capacity,
        });
        scan.prepare(dst.buffer, 1, c.counts);
        let mode: 'exclusive' | 'inclusive' = 'exclusive';
        return {
            update: () => {
                mode = c.values().inclusive ? 'inclusive' : 'exclusive';
            },
            record: (frame) => {
                frame.copy(src.buffer, dst.buffer, dst.capacity * 4);
                scan.record(frame, {
                    src: dst.buffer,
                    dst: dst.buffer,
                    count: { counts: c.counts, index: src.slot },
                    mode,
                });
            },
            dispose: () => {
                scan.destroy();
            },
        };
    },
});

/**
 * `set.sort`: ordenação radix estável crescente (`RadixSort`) dos `bits` menos significativos (múltiplo de 4 em
 * [4, 32], padrão 32). Contagem a da entrada.
 */
export const sort = defineSetNode({
    name: 'set.sort',
    inputs: { values: U32S },
    outputs: { values: U32S },
    params: { bits: { type: 'u32', default: 32 } },
    capacity: (c) => ({ 'values.values': c.input('values', 'values') }),
    counts: { 'values.values': { same: 'values.values' } },
    create: (c) => {
        const src = c.input('values', 'values');
        const dst = c.output('values', 'values');
        const radix = new RadixSort(c.work, {
            discriminator: `${c.id}:sort`,
            capacity: src.capacity,
        });
        radix.prepare(dst.buffer, undefined, 1, c.counts);
        let bits = 32;
        return {
            update: () => {
                const b = Math.floor((c.values().bits as number | undefined) ?? 32);
                bits = Math.min(32, Math.max(4, Math.ceil(b / 4) * 4));
            },
            record: (frame) => {
                frame.copy(src.buffer, dst.buffer, dst.capacity * 4);
                radix.record(frame, {
                    keys: dst.buffer,
                    count: { counts: c.counts, index: src.slot },
                    bits,
                });
            },
            dispose: () => {
                radix.destroy();
            },
        };
    },
});

/**
 * `set.compact`: os índices dos elementos não nulos, em ordem (`Compaction` estável). Contagem da GPU: o total
 * aceito vai ao registro `SetCount` da saída e `CountToArgs` deriva o despacho e o desenho.
 */
export const compact = defineSetNode({
    name: 'set.compact',
    inputs: { values: U32S },
    outputs: { values: U32S },
    capacity: (c) => ({ 'values.values': c.input('values', 'values') }),
    counts: { 'values.values': 'gpu' },
    create: (c) => {
        const k = new SetNodeKernels(c, SetAcceptedParamsSchema);
        const src = c.input('values', 'values');
        const dst = c.output('values', 'values');
        const counter = k.storage('accepted', AtomicAllocCounterSchema.stride);
        const compaction = new Compaction(c.work, {
            discriminator: `${c.id}:compact`,
            predicate: setCompactPredicate,
            capacity: dst.capacity,
            stable: true,
            inputCapacity: src.capacity,
            bindings: new Map([[R.u32In, src.buffer]]),
        });
        compaction.prepare(dst.buffer, counter, 1, c.counts);
        const args = new CountToArgs(c.work, { discriminator: `${c.id}:args` });
        args.prepare(c.counts, 1);
        k.kernel('accepted', setAccepted, 'set_accepted_main', [
            [R.acceptedParams, k.params],
            [R.accepted, counter],
            [R.countsWrite, c.counts],
        ]);
        return {
            update: () => {
                k.write({ slot: dst.slot, capacity: dst.capacity });
            },
            record: (frame) => {
                compaction.record(frame, {
                    count: { counts: c.counts, index: src.slot },
                    out: dst.buffer,
                    counter,
                });
                k.single(frame, 'set.compact.accepted', 'accepted');
                args.record(frame, { counts: c.counts, index: dst.slot, workgroupSize: SET_GROUP });
            },
            dispose: () => {
                compaction.destroy();
                args.destroy();
                k.dispose();
            },
        };
    },
});

/** Operações de `set.reduce` pelo valor do parâmetro `op`. */
const REDUCE_OPS: readonly ReduceOpName[] = ['sum', 'min', 'max'];

/**
 * `set.reduce`: redução (`Reduce`) do conjunto u32 a um valor — `op` 0 soma, 1 mínimo, 2 máximo. Saída de um
 * elemento (contagem da CPU, 1); entrada vazia dá 0. Trocar `op` refaz o kernel (fora da gravação, em `update`).
 */
export const reduce = defineSetNode({
    name: 'set.reduce',
    inputs: { values: U32S },
    outputs: { value: U32S },
    params: { op: { type: 'u32', default: 0 } },
    capacity: () => ({ 'value.values': 1 }),
    create: (c) => {
        const src = c.input('values', 'values');
        const dst = c.output('value', 'values');
        let op: ReduceOpName | undefined;
        let kernel: Reduce | undefined;
        return {
            update: () => {
                const next =
                    REDUCE_OPS[Math.floor((c.values().op as number | undefined) ?? 0)] ?? 'sum';
                if (next === op) return;
                kernel?.destroy();
                op = next;
                kernel = new Reduce(c.work, {
                    discriminator: `${c.id}:reduce_${op}`,
                    capacity: src.capacity,
                    op,
                    type: 'u32',
                });
                kernel.prepare(src.buffer, dst.buffer, 1, c.counts);
            },
            record: (frame) => {
                frame.clear(dst.buffer);
                kernel!.record(frame, {
                    src: src.buffer,
                    count: { counts: c.counts, index: src.slot },
                    out: dst.buffer,
                });
            },
            dispose: () => kernel?.destroy(),
        };
    },
});
