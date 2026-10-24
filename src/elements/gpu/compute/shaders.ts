import { wgslModule, type WgslModule } from '../../../scene/shaders/WgslModule';
import type { BindablePoint } from '../../../scene/shaders/bindPoints';
import { wgslResource, type WgslResource } from '../../../scene/shaders/WgslResource';
import { NONE, WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import { SCAN_GROUP } from '../shaders/constants';
import scanLocalSource from './wgsl/scan_local.wgsl?raw';
import scanTopSource from './wgsl/scan_top.wgsl?raw';
import scanCombineSource from './wgsl/scan_combine.wgsl?raw';
import atomicAllocSource from './wgsl/atomic_alloc.wgsl?raw';
import fixedPointSource from './wgsl/fixed_point.wgsl?raw';
import poolLiveSource from './wgsl/pool_live.wgsl?raw';
import radixHistogramSource from './wgsl/radix_histogram.wgsl?raw';
import radixScatterSource from './wgsl/radix_scatter.wgsl?raw';
import compactAtomicSource from './wgsl/compact_atomic.wgsl?raw';
import compactFlagsSource from './wgsl/compact_flags.wgsl?raw';
import compactScatterSource from './wgsl/compact_scatter.wgsl?raw';
import reduceSource from './wgsl/reduce.wgsl?raw';
import graphColorSource from './wgsl/graph_color.wgsl?raw';
import gcInitSource from './wgsl/gc_init.wgsl?raw';
import gcRoundSource from './wgsl/gc_round.wgsl?raw';
import gcGroupSource from './wgsl/gc_group.wgsl?raw';
import spatialHashSource from './wgsl/spatial_hash.wgsl?raw';
import countToArgsSource from './wgsl/count_to_args.wgsl?raw';
import setCountSource from './wgsl/set_count.wgsl?raw';
import scanCountSource from './wgsl/scan_count.wgsl?raw';
import scanCountGpuSource from './wgsl/scan_count_gpu.wgsl?raw';
import radixCountSource from './wgsl/radix_count.wgsl?raw';
import radixCountGpuSource from './wgsl/radix_count_gpu.wgsl?raw';
import compactCountSource from './wgsl/compact_count.wgsl?raw';
import compactCountGpuSource from './wgsl/compact_count_gpu.wgsl?raw';
import reduceCountSource from './wgsl/reduce_count.wgsl?raw';
import reduceCountGpuSource from './wgsl/reduce_count_gpu.wgsl?raw';
import { SetCountSchema } from '../../../scene/graph/SetCountSchema';
import shCountSource from './wgsl/sh_count.wgsl?raw';
import shScatterSource from './wgsl/sh_scatter.wgsl?raw';
import { hashAddress, noise } from '../shaders/math';
import {
    AtomicAllocCounterSchema,
    ColorRangeSchema,
    CompactParamsSchema,
    CountToArgsParamsSchema,
    GraphColorParamsSchema,
    GraphColorStatusSchema,
    HashGridParamsSchema,
    RadixParamsSchema,
    ReduceLevelSchema,
    ScanLevelSchema,
} from './schemas';

// Algoritmos paralelos genéricos (C3): módulos de suporte, recursos e kernels. Recursos (spec 031): o uniform de cada
// chamada tem frequência `draw` (região própria de uniform, offset dinâmico); os buffers, `stage`.

/** Uniform de parâmetros (região por chamada). */
function callUniform(
    name: string,
    schema: Parameters<typeof wgslResource>[0]['type'],
): WgslResource {
    return wgslResource({
        name,
        binding: { uniform: true },
        type: schema!,
        frequency: 'draw',
        provider: 'private',
    });
}

/** Buffer de storage privado do estágio. */
function stageBuffer(
    name: string,
    access: 'read' | 'read_write',
    type: Parameters<typeof wgslResource>[0]['type'],
): WgslResource {
    return wgslResource({
        name,
        binding: { storage: access },
        type: type!,
        frequency: 'stage',
        provider: 'private',
    });
}

const u32s = { wgsl: 'u32', array: true } as const;
const atomicU32s = { wgsl: 'atomic<u32>', array: true } as const;

/** Recursos da soma de prefixos. */
export const scanResources = Object.freeze({
    level: callUniform('level', { schema: ScanLevelSchema }),
    values: stageBuffer('values', 'read_write', u32s),
    groupSums: stageBuffer('group_sums', 'read_write', u32s),
    groupPrefix: stageBuffer('group_prefix', 'read', u32s),
});

/** Recursos da ordenação radix. */
export const radixResources = Object.freeze({
    radix: callUniform('radix', { schema: RadixParamsSchema }),
    keys: stageBuffer('keys', 'read', u32s),
    histWrite: stageBuffer('hist', 'read_write', u32s),
    histRead: stageBuffer('hist', 'read', u32s),
    keysIn: stageBuffer('keys_in', 'read', u32s),
    keysOut: stageBuffer('keys_out', 'read_write', u32s),
    valuesIn: stageBuffer('values_in', 'read', u32s),
    valuesOut: stageBuffer('values_out', 'read_write', u32s),
});

/** Recursos da compactação. */
export const compactResources = Object.freeze({
    compact: callUniform('compact', { schema: CompactParamsSchema }),
    out: stageBuffer('compact_out', 'read_write', u32s),
    counter: stageBuffer('compact_counter', 'read_write', { schema: AtomicAllocCounterSchema }),
    flags: stageBuffer('compact_flags', 'read_write', u32s),
    positions: stageBuffer('compact_positions', 'read', u32s),
});

/** Recursos da redução (o tipo `ReduceT` vem do módulo de operação). */
export const reduceResources = Object.freeze({
    level: callUniform('reduce_level', { schema: ReduceLevelSchema }),
    input: stageBuffer('reduce_in', 'read', { wgsl: 'ReduceT', array: true }),
    output: stageBuffer('reduce_out', 'read_write', { wgsl: 'ReduceT', array: true }),
});

/** Registros `SetCount` (descritor `indirect`) lidos pelas variantes de contagem da GPU (spec 031). */
export const setCountResources = Object.freeze({
    counts: stageBuffer('set_counts', 'read', { schema: SetCountSchema, array: true }),
});

/** Contagem do nível `depth` de um registro `SetCount` (`set_count_level`), lida na GPU (spec 031, R10). */
export const setCount = wgslModule({
    name: 'set_count',
    source: setCountSource,
    requires: [SCAN_GROUP.module, setCountResources.counts],
    structs: [SetCountSchema],
});

// Contagens das primitivas como pontos vinculáveis (spec 031, R7): os kernels chamam `scan_count()`, `radix_count()`,
// `compact_count()` e `reduce_count()` e requerem o pronto, que lê o campo `count` do uniform (contagem da CPU). A
// variante de contagem da GPU é o kernel com o pronto trocado pelo módulo `*Gpu` (`bindPoints`), que lê o registro
// `SetCount` de índice `count_index` do uniform — a mesma aritmética, só a origem da contagem muda.

/** `fn scan_count() -> u32` — contagem do nível da soma de prefixos. */
export const scanCountPoint: BindablePoint = Object.freeze({
    name: 'scan_count',
    ready: wgslModule({
        name: 'scan_count',
        source: scanCountSource,
        requires: [scanResources.level],
        structs: [ScanLevelSchema],
    }),
});

/** `scan_count` lida do registro `SetCount` (`level.count_index`, nível `level.depth`). */
export const scanCountGpu = wgslModule({
    name: 'scan_count_gpu',
    source: scanCountGpuSource,
    requires: [setCount, scanResources.level],
    structs: [ScanLevelSchema],
});

/** `fn radix_count() -> u32` — elementos da ordenação radix. */
export const radixCountPoint: BindablePoint = Object.freeze({
    name: 'radix_count',
    ready: wgslModule({
        name: 'radix_count',
        source: radixCountSource,
        requires: [radixResources.radix],
        structs: [RadixParamsSchema],
    }),
});

/** `radix_count` lida do registro `SetCount` (`radix.count_index`). */
export const radixCountGpu = wgslModule({
    name: 'radix_count_gpu',
    source: radixCountGpuSource,
    requires: [setCount, radixResources.radix],
    structs: [RadixParamsSchema],
});

/** `fn compact_count() -> u32` — elementos de entrada da compactação. */
export const compactCountPoint: BindablePoint = Object.freeze({
    name: 'compact_count',
    ready: wgslModule({
        name: 'compact_count',
        source: compactCountSource,
        requires: [compactResources.compact],
        structs: [CompactParamsSchema],
    }),
});

/** `compact_count` lida do registro `SetCount` (`compact.count_index`). */
export const compactCountGpu = wgslModule({
    name: 'compact_count_gpu',
    source: compactCountGpuSource,
    requires: [setCount, compactResources.compact],
    structs: [CompactParamsSchema],
});

/** `fn reduce_count() -> u32` — contagem do nível da redução. */
export const reduceCountPoint: BindablePoint = Object.freeze({
    name: 'reduce_count',
    ready: wgslModule({
        name: 'reduce_count',
        source: reduceCountSource,
        requires: [reduceResources.level],
        structs: [ReduceLevelSchema],
    }),
});

/** `reduce_count` lida do registro `SetCount` (`reduce_level.count_index`, nível `reduce_level.depth`). */
export const reduceCountGpu = wgslModule({
    name: 'reduce_count_gpu',
    source: reduceCountGpuSource,
    requires: [setCount, reduceResources.level],
    structs: [ReduceLevelSchema],
});

/** Recursos da coloração de arestas. */
export const graphColorResources = Object.freeze({
    gc: callUniform('gc', { schema: GraphColorParamsSchema }),
    edges: stageBuffer('gc_edges', 'read', { wgsl: 'vec2u', array: true }),
    colors: stageBuffer('gc_colors', 'read_write', u32s),
    colorsRead: stageBuffer('gc_colors', 'read', u32s),
    degree: stageBuffer('gc_degree', 'read_write', atomicU32s),
    vmax: stageBuffer('gc_vmax', 'read_write', atomicU32s),
    used: stageBuffer('gc_used', 'read_write', atomicU32s),
    status: stageBuffer('gc_status', 'read_write', { schema: GraphColorStatusSchema }),
    keys: stageBuffer('gc_keys', 'read_write', u32s),
    values: stageBuffer('gc_values', 'read_write', u32s),
    counts: stageBuffer('gc_counts', 'read_write', atomicU32s),
    offsets: stageBuffer('gc_offsets', 'read', u32s),
    ranges: stageBuffer('gc_ranges', 'read_write', { schema: ColorRangeSchema, array: true }),
});

/** Recursos da grade hash espacial (todos do estágio; o uniform da grade muda por preparação). */
export const hashGridResources = Object.freeze({
    grid: wgslResource({
        name: 'grid',
        binding: { uniform: true },
        type: { schema: HashGridParamsSchema },
        frequency: 'stage',
        provider: 'private',
    }),
    items: stageBuffer('items', 'read', { wgsl: 'vec4f', array: true }),
    counts: stageBuffer('counts', 'read_write', atomicU32s),
    cursors: stageBuffer('cursors', 'read_write', atomicU32s),
    cellItems: stageBuffer('cell_items', 'read_write', u32s),
});

/** Alocação atômica numa lista compactada, com contagem do excedente (`AtomicAllocCounter`). */
export const atomicAlloc = wgslModule({
    name: 'atomic_alloc',
    source: atomicAllocSource,
    requires: [NONE.module],
    structs: [AtomicAllocCounterSchema],
});

/**
 * Slot vivo de um pool (spec 008): `pool_live(live[slot >> 5u], slot)` com o bitset de ocupação que a C2 mantém
 * (fornecedor `{ slot, part: 'live' }` ou o resolver `<chave do pool>.live`).
 */
export const poolLive = wgslModule({ name: 'pool_live', source: poolLiveSource });

/** Ponto fixo i32 com escala e saturação, para somas atômicas de valores reais. */
export const fixedPoint = wgslModule({ name: 'fixed_point', source: fixedPointSource });

/** Soma de prefixos: um nível, por grupo de 256, no lugar (subida). */
export const scanLocal = wgslModule({
    name: 'scan_local',
    source: scanLocalSource,
    requires: [
        SCAN_GROUP.module,
        scanCountPoint.ready,
        scanResources.level,
        scanResources.values,
        scanResources.groupSums,
    ],
    structs: [ScanLevelSchema],
});

/** Soma de prefixos: nível de topo num grupo. */
export const scanTop = wgslModule({
    name: 'scan_top',
    source: scanTopSource,
    requires: [SCAN_GROUP.module, scanCountPoint.ready, scanResources.level, scanResources.values],
    structs: [ScanLevelSchema],
});

/** Soma de prefixos: descida de um nível (soma o prefixo do grupo). */
export const scanCombine = wgslModule({
    name: 'scan_combine',
    source: scanCombineSource,
    requires: [
        SCAN_GROUP.module,
        scanCountPoint.ready,
        scanResources.level,
        scanResources.values,
        scanResources.groupPrefix,
    ],
    structs: [ScanLevelSchema],
});

/** Ordenação radix: histograma de dígitos por grupo (dígito-maior). */
export const radixHistogram = wgslModule({
    name: 'radix_histogram',
    source: radixHistogramSource,
    requires: [
        radixCountPoint.ready,
        radixResources.radix,
        radixResources.keys,
        radixResources.histWrite,
    ],
    structs: [RadixParamsSchema],
});

/** Ordenação radix: espalhamento estável (entradas só chaves e chaves com valores). */
export const radixScatter = wgslModule({
    name: 'radix_scatter',
    source: radixScatterSource,
    requires: [
        NONE.module,
        radixCountPoint.ready,
        radixResources.radix,
        radixResources.keysIn,
        radixResources.keysOut,
        radixResources.histRead,
        radixResources.valuesIn,
        radixResources.valuesOut,
    ],
    structs: [RadixParamsSchema],
});

/** Kernels de compactação montados sobre um predicado do consumidor. */
export interface CompactionModules {
    /** Passe único por `atomic_alloc` (ordem não garantida). */
    readonly atomic: WgslModule;
    /** Modo estável: flags do predicado. */
    readonly flags: WgslModule;
    /** Modo estável: espalhamento pelas posições escaneadas. */
    readonly scatter: WgslModule;
}

const compactionCache = new WeakMap<WgslModule, CompactionModules>();

/**
 * Kernels de compactação para o predicado `predicate`, que define `fn compact_keep(i: u32) -> bool` e
 * `fn compact_value(i: u32) -> u32` (e os bindings que lê, no grupo 1). Memorizado por predicado.
 */
export function compactionModules(predicate: WgslModule): CompactionModules {
    const cached = compactionCache.get(predicate);
    if (cached !== undefined) return cached;
    for (const fn of ['compact_keep', 'compact_value']) {
        if (!predicate.symbols.some((s) => s.kind === 'fn' && s.name === fn)) {
            throw new Error(
                `Compaction: o módulo de predicado '${predicate.name}' precisa definir fn ${fn}(i: u32).`,
            );
        }
    }
    const modules: CompactionModules = Object.freeze({
        atomic: wgslModule({
            name: `compact_atomic:${predicate.name}`,
            source: compactAtomicSource,
            requires: [
                atomicAlloc,
                predicate,
                compactCountPoint.ready,
                compactResources.compact,
                compactResources.out,
                compactResources.counter,
            ],
            structs: [CompactParamsSchema],
        }),
        flags: wgslModule({
            name: `compact_flags:${predicate.name}`,
            source: compactFlagsSource,
            requires: [
                predicate,
                compactCountPoint.ready,
                compactResources.compact,
                compactResources.flags,
            ],
            structs: [CompactParamsSchema],
        }),
        scatter: wgslModule({
            name: `compact_scatter:${predicate.name}`,
            source: compactScatterSource,
            requires: [
                predicate,
                compactCountPoint.ready,
                compactResources.compact,
                compactResources.out,
                compactResources.counter,
                compactResources.positions,
            ],
            structs: [CompactParamsSchema, AtomicAllocCounterSchema],
        }),
    });
    compactionCache.set(predicate, modules);
    return modules;
}

/** Operação de redução. */
export type ReduceOpName = 'sum' | 'min' | 'max';
/** Tipo dos elementos reduzidos. */
export type ReduceType = 'u32' | 'i32' | 'f32';

const REDUCE_IDENTITIES: Record<ReduceOpName, Record<ReduceType, string>> = {
    sum: { u32: '0u', i32: '0i', f32: '0.0' },
    min: { u32: '0xFFFFFFFFu', i32: '2147483647i', f32: '0x1.fffffep+127f' },
    // Maior f32 finito em hexadecimal exato (o decimal arredondado passa do limite); -2147483648i não é literal válido
    // (o literal positivo estoura antes da negação).
    max: { u32: '0u', i32: '-2147483647i - 1i', f32: '-0x1.fffffep+127f' },
};

const REDUCE_EXPRESSIONS: Record<ReduceOpName, string> = {
    sum: 'a + b',
    min: 'min(a, b)',
    max: 'max(a, b)',
};

const reduceOpCache = new Map<string, WgslModule>();
const reduceKernelCache = new Map<string, WgslModule>();

/**
 * Módulo de operação da redução (research R11): `alias ReduceT`, `const REDUCE_IDENTITY` e `fn reduce_op`. Memorizado
 * por (operação, tipo): a mesma combinação é o mesmo módulo, logo o mesmo pipeline.
 */
export function reduceOp(op: ReduceOpName, type: ReduceType): WgslModule {
    const key = `${op}_${type}`;
    let module = reduceOpCache.get(key);
    if (module === undefined) {
        module = wgslModule({
            name: `reduce_op_${key}`,
            source: `
alias ReduceT = ${type};
const REDUCE_IDENTITY: ReduceT = ${REDUCE_IDENTITIES[op][type]};
fn reduce_op(a: ReduceT, b: ReduceT) -> ReduceT { return ${REDUCE_EXPRESSIONS[op]}; }
`,
        });
        reduceOpCache.set(key, module);
    }
    return module;
}

/** Kernel de redução para a operação e o tipo dados (memorizado). */
export function reduceKernel(op: ReduceOpName, type: ReduceType): WgslModule {
    const key = `${op}_${type}`;
    let module = reduceKernelCache.get(key);
    if (module === undefined) {
        module = wgslModule({
            name: `reduce:${key}`,
            source: reduceSource,
            requires: [
                reduceOp(op, type),
                reduceCountPoint.ready,
                reduceResources.level,
                reduceResources.input,
                reduceResources.output,
            ],
            structs: [ReduceLevelSchema],
        });
        reduceKernelCache.set(key, module);
    }
    return module;
}

/** Coloração de arestas: definições comuns (aresta sem cor, prioridade por subpasso). */
const graphColor = wgslModule({
    name: 'graph_color',
    source: graphColorSource,
    requires: [noise, NONE.module],
});

/** Coloração de arestas: preparação, grau e validação. */
export const gcInit = wgslModule({
    name: 'gc_init',
    source: gcInitSource,
    requires: [
        graphColor,
        graphColorResources.gc,
        graphColorResources.edges,
        graphColorResources.colors,
        graphColorResources.degree,
        graphColorResources.status,
    ],
    structs: [GraphColorParamsSchema, GraphColorStatusSchema],
});

/** Coloração de arestas: subpasso da cor corrente (prioridade, atribuição, avanço). */
export const gcRound = wgslModule({
    name: 'gc_round',
    source: gcRoundSource,
    requires: [
        graphColor,
        graphColorResources.gc,
        graphColorResources.edges,
        graphColorResources.colors,
        graphColorResources.vmax,
        graphColorResources.used,
        graphColorResources.status,
    ],
    structs: [GraphColorParamsSchema, GraphColorStatusSchema],
});

/** Coloração de arestas: agrupamento por cor (chaves da ordenação, contagens, intervalos). */
export const gcGroup = wgslModule({
    name: 'gc_group',
    source: gcGroupSource,
    requires: [
        graphColorResources.gc,
        graphColorResources.colorsRead,
        graphColorResources.keys,
        graphColorResources.values,
        graphColorResources.counts,
        graphColorResources.offsets,
        graphColorResources.ranges,
        graphColorResources.status,
    ],
    structs: [GraphColorParamsSchema, GraphColorStatusSchema, ColorRangeSchema],
});

/** Grade hash espacial: célula de um ponto e o seu balde (`sh_cell`, `sh_hash`) e os parâmetros da grade. */
export const spatialHash = wgslModule({
    name: 'spatial_hash',
    source: spatialHashSource,
    requires: [hashAddress],
    structs: [HashGridParamsSchema],
});

/** Grade hash: contagem dos itens por balde. */
export const shCount = wgslModule({
    name: 'sh_count',
    source: shCountSource,
    requires: [
        spatialHash,
        WORKGROUP_SIZE.module,
        hashGridResources.grid,
        hashGridResources.items,
        hashGridResources.counts,
    ],
});

/** Grade hash: espalhamento dos índices nos baldes. */
export const shScatter = wgslModule({
    name: 'sh_scatter',
    source: shScatterSource,
    requires: [
        spatialHash,
        WORKGROUP_SIZE.module,
        hashGridResources.grid,
        hashGridResources.items,
        hashGridResources.cursors,
        hashGridResources.cellItems,
    ],
});

/** Recursos da conversão contagem → argumentos. */
export const countToArgsResources = Object.freeze({
    params: callUniform('p', { schema: CountToArgsParamsSchema }),
    counts: stageBuffer('set_counts', 'read_write', { schema: SetCountSchema, array: true }),
});

/** Contagem → argumentos de despacho e de desenho, no próprio registro `SetCount` (spec 031). */
export const countToArgs = wgslModule({
    name: 'count_to_args',
    source: countToArgsSource,
    requires: [countToArgsResources.params, countToArgsResources.counts],
    structs: [CountToArgsParamsSchema, SetCountSchema],
});
