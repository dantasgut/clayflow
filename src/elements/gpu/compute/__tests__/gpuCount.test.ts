import { describe, expect, it } from 'vitest';
import { Compaction } from '../Compaction';
import { CountToArgs, type GpuCount } from '../CountToArgs';
import { PrefixSum, SCAN_GROUP, scanLevelCounts } from '../PrefixSum';
import { RadixSort } from '../RadixSort';
import { Reduce, reduceLevelCounts } from '../Reduce';
import { wgslModule } from '../../../../scene/shaders/WgslModule';
import { wgslResource } from '../../../../scene/shaders/WgslResource';
import {
    fakeResourceCore,
    type WriteCall,
} from '../../../../scene/__tests__/helpers/fakeResourceCore';
import { recordingFrame } from '../../../physics/__tests__/helpers/recordingFrame';
import { SET_COUNT_DISPATCH_OFFSET, SetCountSchema } from '../../../../scene/graph/SetCountSchema';
import type {
    EngineCore,
    IndirectBufferSpec,
    StorageBufferSpec,
} from '../../../../scene/contracts/gpu';

// Variante de contagem da GPU das primitivas (spec 031, T069): a contagem vem de um registro `SetCount` lido no
// kernel, com despacho indireto; o caminho com contagem da CPU segue igual.

const storage = (discriminator: string, byteSize = 1 << 20): StorageBufferSpec => ({
    kind: 'buffer',
    subkind: 'storage',
    discriminator,
    byteSize,
});

const setCounts = (discriminator: string, records = 4): IndirectBufferSpec => ({
    kind: 'buffer',
    subkind: 'indirect',
    discriminator,
    byteSize: records * SetCountSchema.stride,
});

/** Byte dos argumentos de despacho do registro `index`. */
const dispatchAt = (index: number): number =>
    index * SetCountSchema.stride + SET_COUNT_DISPATCH_OFFSET;

const disc = (spec: unknown): string => (spec as { discriminator?: string }).discriminator ?? '';

interface CreatedSpec {
    readonly kind: string;
    readonly discriminator?: string;
    readonly shader?: { readonly source: string };
    readonly bindings?: readonly { readonly buffer?: unknown }[];
}

const createdSpecs = (core: EngineCore): CreatedSpec[] =>
    (core.create as unknown as { mock: { calls: unknown[][] } }).mock.calls.map(
        (c) => c[0] as CreatedSpec,
    );

/** Pipelines criados, por discriminator. */
function pipelines(core: EngineCore): Map<string, CreatedSpec> {
    return new Map(
        createdSpecs(core)
            .filter((s) => s.kind === 'pipeline')
            .map((s) => [disc(s), s]),
    );
}

/** Discriminators dos bind groups que ligam `buffer`. */
const bindGroupsWith = (core: EngineCore, buffer: unknown): string[] =>
    createdSpecs(core)
        .filter((s) => s.kind === 'bindgroup' && s.bindings!.some((b) => b.buffer === buffer))
        .map(disc);

/** u32 das escritas nas regiões de uniform cujo buffer tem `prefix`. */
const uniformWrites = (writes: readonly WriteCall[], prefix: string, fields: number): number[][] =>
    writes
        .filter((w) => disc(w.spec).startsWith(`${prefix}:frame_uniforms:`))
        .map((w) => [...new Uint32Array(w.bytes.buffer, w.bytes.byteOffset, fields)]);

const dispatches = (rec: ReturnType<typeof recordingFrame>) =>
    rec.passes.map((p) => [p.label, p.dispatches[0]]);

/** O shader de um kernel da variante da GPU lê o registro e não o campo de contagem do uniform `uniform`. */
function expectGpuShader(source: string, uniform: string): void {
    expect(source).toContain('fn set_count_level(');
    expect(source).toContain('set_counts[index].count');
    expect(source).not.toMatch(new RegExp(`\\b${uniform}\\.count\\b`));
}

/** O shader com contagem da CPU lê o uniform e não conhece o registro. */
function expectCpuShader(source: string, uniform: string): void {
    expect(source).toMatch(new RegExp(`\\b${uniform}\\.count\\b`));
    expect(source).not.toContain('set_count_level');
    expect(source).not.toContain('set_counts');
}

describe('CountToArgs', () => {
    const counts = setCounts('sc');

    it('prepare cria um kernel por buffer de registros; gravar escreve o uniform e despacha um grupo', () => {
        const { core, writes } = fakeResourceCore();
        const c2a = new CountToArgs(core, { discriminator: 'c2a' });
        c2a.prepare(counts);
        c2a.prepare(counts);
        const made = [...pipelines(core).keys()];
        expect(made).toEqual(['c2a:count_to_args:0_pipeline']);
        c2a.prepare(setCounts('other'));
        expect([...pipelines(core).keys()]).toEqual([
            'c2a:count_to_args:0_pipeline',
            'c2a:count_to_args:1_pipeline',
        ]);
        expect(bindGroupsWith(core, counts)).toHaveLength(1);

        const rec = recordingFrame();
        c2a.record(rec.frame, { counts, index: 3, workgroupSize: 256, perElement: 6 });
        expect(dispatches(rec)).toEqual([['CountToArgs', [1]]]);
        // index, group_size, per_element, instances, instanced, max_x
        expect(uniformWrites(writes, 'c2a:count_to_args', 6)).toEqual([[3, 256, 6, 1, 0, 65_535]]);
    });

    it('desenho instanciado e sem desenho (perElement padrão 0)', () => {
        const { core, writes } = fakeResourceCore();
        const c2a = new CountToArgs(core, { discriminator: 'c2a' });
        c2a.prepare(counts, 2);
        const rec = recordingFrame();
        c2a.record(rec.frame, {
            counts,
            index: 0,
            workgroupSize: 64,
            perElement: 36,
            instanced: true,
        });
        c2a.record(rec.frame, { counts, index: 1, workgroupSize: 128 });
        expect(uniformWrites(writes, 'c2a:count_to_args', 5)).toEqual([
            [0, 64, 36, 1, 1],
            [1, 128, 0, 1, 0],
        ]);
    });

    it('o kernel converte contagem em despacho (x/y) e desenho no próprio registro', () => {
        const { core } = fakeResourceCore();
        const c2a = new CountToArgs(core, { discriminator: 'c2a' });
        c2a.prepare(counts);
        const source = pipelines(core).get('c2a:count_to_args:0_pipeline')!.shader!.source;
        expect(source).toContain('let n = set_counts[p.index].count;');
        expect(source).toContain('set_counts[p.index].dispatch_x = x;');
        expect(source).toContain('set_counts[p.index].index_count =');
    });

    it('erros: gravar sem prepare, argumentos inválidos, registro fora do buffer', () => {
        const { core } = fakeResourceCore();
        const c2a = new CountToArgs(core, { discriminator: 'c2a' });
        const rec = recordingFrame();
        expect(() => {
            c2a.record(rec.frame, { counts, index: 0, workgroupSize: 256 });
        }).toThrow(/prepare/);
        c2a.prepare(counts, 8);
        for (const bad of [
            { index: -1, workgroupSize: 256 },
            { index: 1.5, workgroupSize: 256 },
            { index: 0, workgroupSize: 0 },
            { index: 0, workgroupSize: 256, perElement: -3 },
            { index: 4, workgroupSize: 256 },
        ]) {
            expect(() => {
                c2a.record(rec.frame, { counts, ...bad });
            }).toThrow(RangeError);
        }
        expect(rec.passes).toHaveLength(0);
    });

    it('offset de despacho e conferência de um GpuCount', () => {
        expect(CountToArgs.dispatchOffset({ counts, index: 0 })).toBe(4);
        expect(CountToArgs.dispatchOffset({ counts, index: 2 })).toBe(2 * 48 + 4);
        expect(() => {
            CountToArgs.check('x', { counts, index: 3 });
        }).not.toThrow();
        expect(() => {
            CountToArgs.check('x', { counts, index: 4 });
        }).toThrow(/fora do buffer/);
        expect(() => {
            CountToArgs.check('x', { counts, index: -1 });
        }).toThrow(RangeError);
    });
});

describe('PrefixSum — contagem da GPU', () => {
    // Capacidade 70 000: níveis [70 000, 274, 2].
    const counts = setCounts('sc');
    const gpu = (index: number): GpuCount => ({ counts, index });

    function setup() {
        const { core, writes } = fakeResourceCore();
        const scan = new PrefixSum(core, { discriminator: 'ps', capacity: 70_000 });
        return { core, writes, scan };
    }

    it('contagem da CPU: os mesmos despachos e shaders de antes, sem o registro', () => {
        const { core, scan } = setup();
        const a = storage('a');
        scan.prepare(a, 1, counts);
        const rec = recordingFrame();
        scan.record(rec.frame, { src: a, dst: a, count: 70_000 });
        expect(dispatches(rec)).toEqual([
            ['PrefixSum.scan_local', [70_000, 256]],
            ['PrefixSum.scan_local', [274, 256]],
            ['PrefixSum.scan_top', [1]],
            ['PrefixSum.scan_combine', [274, 256]],
            ['PrefixSum.scan_combine', [70_000, 256]],
        ]);
        for (const kind of ['scan_local', 'scan_top', 'scan_combine']) {
            expectCpuShader(pipelines(core).get(`ps:${kind}_pipeline`)!.shader!.source, 'level');
        }
    });

    it('variante da GPU: shaders lendo o registro, set_counts ligado só nos kernels dela', () => {
        const { core, scan } = setup();
        const a = storage('a');
        scan.prepare(a, 1, counts);
        for (const kind of ['scan_local', 'scan_top', 'scan_combine']) {
            expectGpuShader(
                pipelines(core).get(`ps:${kind}:gpu_pipeline`)!.shader!.source,
                'level',
            );
        }
        const withCounts = bindGroupsWith(core, counts);
        expect(withCounts.length).toBeGreaterThan(0);
        expect(withCounts.every((d) => d.includes(':gpu'))).toBe(true);
    });

    it('todos os níveis da capacidade: nível 0 indireto, os de cima pela capacidade; uniforms com profundidade e índice', () => {
        const { scan, writes } = setup();
        const a = storage('a');
        scan.prepare(a, 1, counts);
        const rec = recordingFrame();
        scan.record(rec.frame, { src: a, dst: a, count: gpu(2), mode: 'inclusive' });
        expect(dispatches(rec)).toEqual([
            ['PrefixSum.scan_local', [-1, dispatchAt(2)]],
            ['PrefixSum.scan_local', [274, 256]],
            ['PrefixSum.scan_top', [1]],
            ['PrefixSum.scan_combine', [274, 256]],
            ['PrefixSum.scan_combine', [-1, dispatchAt(2)]],
        ]);
        expect(rec.copies).toBe(0);
        // count (capacidade do nível, não lida), inclusive, depth, count_index
        expect(uniformWrites(writes, 'ps:scan', 4)).toEqual([
            [70_000, 1, 0, 2],
            [274, 0, 1, 2],
            [2, 0, 2, 2],
        ]);
    });

    it('src ≠ dst copia (a contagem é desconhecida); kernels memorizados por buffer de registros', () => {
        const { core, scan } = setup();
        const src = storage('src');
        const dst = storage('dst');
        scan.prepare(dst, 1, counts);
        const before = pipelines(core).size;
        scan.prepare(dst, 1, counts);
        expect(pipelines(core).size).toBe(before);
        const rec = recordingFrame();
        scan.record(rec.frame, { src, dst, count: gpu(0) });
        expect(rec.copies).toBe(1);
        const other = setCounts('other');
        scan.prepare(dst, 1, other);
        expect(bindGroupsWith(core, other).length).toBeGreaterThan(0);
    });

    it('erros: sem prepare com counts; índice fora do buffer', () => {
        const { scan } = setup();
        const a = storage('a');
        scan.prepare(a);
        const rec = recordingFrame();
        expect(() => {
            scan.record(rec.frame, { src: a, dst: a, count: gpu(0) });
        }).toThrow(/counts/);
        scan.prepare(a, 1, counts);
        expect(() => {
            scan.record(rec.frame, { src: a, dst: a, count: gpu(4) });
        }).toThrow(RangeError);
        expect(rec.passes).toHaveLength(0);
    });
});

describe('RadixSort — contagem da GPU', () => {
    // Capacidade 1000: 4 grupos; histograma de 64 entradas (níveis da soma [64, 1]).
    const counts = setCounts('sc');
    const keys = storage('k');

    function setup() {
        const { core, writes } = fakeResourceCore();
        const sort = new RadixSort(core, { discriminator: 'rs', capacity: 1000 });
        sort.prepare(keys, undefined, 1, counts);
        return { core, writes, sort };
    }

    it('contagem da CPU: os mesmos despachos de antes', () => {
        const { core, sort } = setup();
        const rec = recordingFrame();
        sort.record(rec.frame, { keys, count: 300, bits: 4 });
        expect(dispatches(rec)).toEqual([
            ['RadixSort.histogram', [300, 256]],
            ['PrefixSum.scan_local', [32, 256]],
            ['PrefixSum.scan_top', [1]],
            ['PrefixSum.scan_combine', [32, 256]],
            ['RadixSort.scatter', [300, 256]],
        ]);
        expect(rec.copies).toBe(1);
        expectCpuShader(
            pipelines(core).get('rs:radix_histogram_pipeline')!.shader!.source,
            'radix',
        );
        expectCpuShader(pipelines(core).get('rs:radix_scatter_pipeline')!.shader!.source, 'radix');
    });

    it('variante da GPU: histograma pela capacidade, espalhamento indireto, grupos da capacidade', () => {
        const { core, writes, sort } = setup();
        const rec = recordingFrame();
        sort.record(rec.frame, { keys, count: { counts, index: 1 }, bits: 8 });
        const pass = [
            ['RadixSort.histogram', [1000, 256]],
            ['PrefixSum.scan_local', [64, 256]],
            ['PrefixSum.scan_top', [1]],
            ['PrefixSum.scan_combine', [64, 256]],
            ['RadixSort.scatter', [-1, dispatchAt(1)]],
        ];
        expect(dispatches(rec)).toEqual([...pass, ...pass]);
        expect(rec.copies).toBe(0);
        // count (não lido), shift, groups (da capacidade), count_index
        expect(uniformWrites(writes, 'rs:radix', 4)).toEqual([
            [1000, 0, 4, 1],
            [1000, 4, 4, 1],
        ]);
        expectGpuShader(
            pipelines(core).get('rs:radix_histogram:gpu_pipeline')!.shader!.source,
            'radix',
        );
        expectGpuShader(
            pipelines(core).get('rs:radix_scatter:gpu_pipeline')!.shader!.source,
            'radix',
        );
        expect(bindGroupsWith(core, counts).every((d) => d.includes(':gpu'))).toBe(true);
        expect(bindGroupsWith(core, counts).length).toBeGreaterThan(0);
    });

    it('passes ímpares: chaves ao temporário antes e de volta depois (a cauda volta intacta)', () => {
        const { sort } = setup();
        const rec = recordingFrame();
        sort.record(rec.frame, { keys, count: { counts, index: 0 }, bits: 12 });
        expect(rec.copies).toBe(2);
    });

    it('sem prepare com counts → erro', () => {
        const { core } = fakeResourceCore();
        const sort = new RadixSort(core, { discriminator: 'rs', capacity: 1000 });
        sort.prepare(keys);
        expect(() => {
            sort.record(recordingFrame().frame, { keys, count: { counts, index: 0 } });
        }).toThrow(/counts/);
    });
});

describe('Compaction — contagem da GPU', () => {
    const counts = setCounts('sc');
    const out = storage('out');
    const ctr = storage('ctr');
    const testValues = wgslResource({
        name: 'gpu_count_test_values',
        binding: { storage: 'read' },
        type: { wgsl: 'u32', array: true },
        frequency: 'stage',
        provider: 'private',
    });
    const predicate = wgslModule({
        name: 'gpu_count_test_even',
        requires: [testValues],
        source: `
fn compact_keep(i: u32) -> bool { return (gpu_count_test_values[i] & 1u) == 0u; }
fn compact_value(i: u32) -> u32 { return i; }`,
    });

    function setup(stable: boolean) {
        const { core, writes } = fakeResourceCore();
        const compaction = new Compaction(core, {
            discriminator: 'cp',
            predicate,
            capacity: 100,
            bindings: new Map([[testValues, storage('values')]]),
            ...(stable ? { stable: true, inputCapacity: 70_000 } : {}),
        });
        compaction.prepare(out, ctr, 1, counts);
        return { core, writes, compaction };
    }

    it('contagem da CPU: o mesmo passe de antes', () => {
        const { core, compaction } = setup(false);
        const rec = recordingFrame();
        compaction.record(rec.frame, { count: 1000, out, counter: ctr });
        expect(rec.sequence).toEqual(['clear:ctr', 'pass:Compaction.atomic']);
        expect(rec.passes[0]!.dispatches[0]).toEqual([1000, 256]);
        expectCpuShader(
            pipelines(core).get('cp:compact_atomic_pipeline')!.shader!.source,
            'compact',
        );
    });

    it('modo atômico: contador zerado e passe indireto', () => {
        const { core, writes, compaction } = setup(false);
        const rec = recordingFrame();
        compaction.record(rec.frame, { count: { counts, index: 3 }, out, counter: ctr });
        expect(rec.sequence).toEqual(['clear:ctr', 'pass:Compaction.atomic']);
        expect(rec.passes[0]!.dispatches[0]).toEqual([-1, dispatchAt(3)]);
        // count (não lido), capacity, count_index
        expect(uniformWrites(writes, 'cp:compact', 3)).toEqual([[0, 100, 3]]);
        expectGpuShader(
            pipelines(core).get('cp:compact_atomic:gpu_pipeline')!.shader!.source,
            'compact',
        );
        expect(bindGroupsWith(core, counts).every((d) => d.includes(':gpu'))).toBe(true);
    });

    it('modo estável: flags e espalhamento indiretos, soma de prefixos com a mesma contagem da GPU', () => {
        const { core, compaction } = setup(true);
        const rec = recordingFrame();
        compaction.record(rec.frame, { count: { counts, index: 1 }, out, counter: ctr });
        expect(rec.sequence[0]).toBe('clear:ctr');
        expect(dispatches(rec)).toEqual([
            ['Compaction.flags', [-1, dispatchAt(1)]],
            ['PrefixSum.scan_local', [-1, dispatchAt(1)]],
            ['PrefixSum.scan_local', [274, 256]],
            ['PrefixSum.scan_top', [1]],
            ['PrefixSum.scan_combine', [274, 256]],
            ['PrefixSum.scan_combine', [-1, dispatchAt(1)]],
            ['Compaction.scatter', [-1, dispatchAt(1)]],
        ]);
        for (const kind of ['compact_flags', 'compact_scatter']) {
            expectGpuShader(
                pipelines(core).get(`cp:${kind}:gpu_pipeline`)!.shader!.source,
                'compact',
            );
        }
        expect(pipelines(core).has('cp:compact_scan:scan_local:gpu_pipeline')).toBe(true);
    });

    it('sem prepare com counts → erro', () => {
        const { core } = fakeResourceCore();
        const compaction = new Compaction(core, {
            discriminator: 'cp',
            predicate,
            capacity: 100,
            bindings: new Map([[testValues, storage('values')]]),
        });
        compaction.prepare(out, ctr);
        expect(() => {
            compaction.record(recordingFrame().frame, {
                count: { counts, index: 0 },
                out,
                counter: ctr,
            });
        }).toThrow(/counts/);
    });
});

describe('Reduce — contagem da GPU', () => {
    // Capacidade 70 000: níveis [70 000, 274, 2, 1] — três passes.
    const counts = setCounts('sc');
    const src = storage('src');
    const out = storage('out');

    function setup() {
        const { core, writes } = fakeResourceCore();
        const reduce = new Reduce(core, {
            discriminator: 'rd',
            capacity: 70_000,
            op: 'sum',
            type: 'f32',
        });
        reduce.prepare(src, out, 1, counts);
        return { core, writes, reduce };
    }

    it('contagem da CPU: os mesmos passes de antes', () => {
        const { core, reduce } = setup();
        const rec = recordingFrame();
        reduce.record(rec.frame, { src, out, count: 300 });
        expect(dispatches(rec)).toEqual([
            ['Reduce', [300, 256]],
            ['Reduce', [2, 256]],
        ]);
        expectCpuShader(pipelines(core).get('rd:reduce_pipeline')!.shader!.source, 'reduce_level');
    });

    it('variante da GPU: todos os passes da capacidade, o primeiro indireto; o último no outOffset', () => {
        const { core, writes, reduce } = setup();
        const rec = recordingFrame();
        reduce.record(rec.frame, { src, out, count: { counts, index: 2 }, outOffset: 5 });
        expect(dispatches(rec)).toEqual([
            ['Reduce', [-1, dispatchAt(2)]],
            ['Reduce', [274, 256]],
            ['Reduce', [2, 256]],
        ]);
        // count (capacidade do nível, não lida), out_index, depth, count_index
        expect(uniformWrites(writes, 'rd:reduce', 4)).toEqual([
            [70_000, 0, 0, 2],
            [274, 0, 1, 2],
            [2, 5, 2, 2],
        ]);
        expectGpuShader(
            pipelines(core).get('rd:reduce:gpu_pipeline')!.shader!.source,
            'reduce_level',
        );
        expect(bindGroupsWith(core, counts).every((d) => d.includes(':gpu'))).toBe(true);
    });

    it('sem prepare com counts → erro; registro fora do buffer → RangeError', () => {
        const { core } = fakeResourceCore();
        const reduce = new Reduce(core, {
            discriminator: 'rd',
            capacity: 10,
            op: 'max',
            type: 'u32',
        });
        reduce.prepare(src, out);
        const rec = recordingFrame();
        expect(() => {
            reduce.record(rec.frame, { src, out, count: { counts, index: 0 } });
        }).toThrow(/counts/);
        reduce.prepare(src, out, 1, counts);
        expect(() => {
            reduce.record(rec.frame, { src, out, count: { counts, index: 9 } });
        }).toThrow(RangeError);
    });
});

// Referência na CPU dos kernels da variante da GPU: todos os níveis da capacidade rodam, cada um limitado pela contagem
// do registro reduzida até a sua profundidade (`set_count_level`). Confere os casos de borda: 0, 1, um grupo, o
// limite de um nível, a capacidade.

/** `set_count_level`: a contagem reduzida `depth` vezes por ⌈c / 256⌉. */
function setCountLevel(n: number, depth: number): number {
    let c = n;
    for (let d = 0; d < depth; d++) c = Math.ceil(c / SCAN_GROUP);
    return c;
}

/** Soma de prefixos com todos os níveis da capacidade e contagens do registro; níveis de cima com lixo inicial. */
function scanGpuVariant(values: Uint32Array, n: number, capacity: number, inclusive: boolean) {
    const caps = scanLevelCounts(capacity);
    const top = caps.length - 1;
    const levels = caps.map((c, k) => (k === 0 ? values.slice() : new Uint32Array(c).fill(0xdead)));
    const local = (k: number): void => {
        const vals = levels[k]!;
        const count = setCountLevel(n, k);
        const incl = inclusive && k === 0;
        for (let g = 0; g * SCAN_GROUP < count; g++) {
            let acc = 0;
            for (let i = g * SCAN_GROUP; i < Math.min(count, (g + 1) * SCAN_GROUP); i++) {
                const v = vals[i]!;
                acc = (acc + v) >>> 0;
                vals[i] = incl ? acc : (acc - v) >>> 0;
            }
            if (k < top) levels[k + 1]![g] = acc;
        }
    };
    for (let k = 0; k < top; k++) local(k);
    local(top);
    for (let k = top - 1; k >= 0; k--) {
        const count = setCountLevel(n, k);
        for (let i = 0; i < count; i++) {
            levels[k]![i] = (levels[k]![i]! + levels[k + 1]![Math.floor(i / SCAN_GROUP)]!) >>> 0;
        }
    }
    return levels[0]!;
}

/** Redução por soma com todos os passes da capacidade; o último escreve em `out[outOffset + grupo]`. */
function reduceGpuVariant(values: Float64Array, n: number, capacity: number, out: Float64Array) {
    const caps = reduceLevelCounts(capacity);
    const passes = caps.length - 1;
    let input = values;
    for (let k = 0; k < passes; k++) {
        const count = setCountLevel(n, k);
        const output = k === passes - 1 ? out : new Float64Array(caps[k + 1]!).fill(Number.NaN);
        for (let g = 0; g * SCAN_GROUP < count; g++) {
            let acc = 0;
            for (let i = g * SCAN_GROUP; i < Math.min(count, (g + 1) * SCAN_GROUP); i++)
                acc += input[i]!;
            output[g] = acc;
        }
        input = output;
    }
}

describe('variante da GPU — referência do algoritmo nos casos de borda', () => {
    const capacity = 70_000;
    let seed = 777;
    const values = new Uint32Array(capacity).map(() => {
        seed = (seed * 1103515245 + 12345) >>> 0;
        return seed % 7;
    });

    it.each([0, 1, 255, 256, 257, 300, 65_536, 65_537, capacity])(
        'soma de prefixos com contagem %i: igual à sequencial, cauda intacta',
        (n) => {
            for (const inclusive of [false, true]) {
                const got = scanGpuVariant(values, n, capacity, inclusive);
                let acc = 0;
                for (let i = 0; i < n; i++) {
                    if (inclusive) acc += values[i]!;
                    expect(got[i]).toBe(acc);
                    if (!inclusive) acc += values[i]!;
                }
                expect(got.subarray(n)).toEqual(values.subarray(n));
            }
        },
    );

    it.each([0, 1, 256, 257, 65_536, 65_537, capacity])(
        'redução com contagem %i: igual à sequencial; 0 não escreve',
        (n) => {
            const data = Float64Array.from(values);
            const out = new Float64Array(8).fill(-1);
            reduceGpuVariant(data, n, capacity, out);
            const expected = n === 0 ? -1 : data.subarray(0, n).reduce((a, b) => a + b, 0);
            expect(out[0]).toBe(expected);
            expect(out[1]).toBe(-1);
        },
    );
});
