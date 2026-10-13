import { wgslModule, type WgslModule } from '../../../scene/shaders/WgslModule';
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
import shCountSource from './wgsl/sh_count.wgsl?raw';
import shScatterSource from './wgsl/sh_scatter.wgsl?raw';
import { noise } from '../shaders/math';
import {
    AtomicAllocCounterSchema,
    ColorRangeSchema,
    CompactParamsSchema,
    GraphColorParamsSchema,
    GraphColorStatusSchema,
    HashGridParamsSchema,
    RadixParamsSchema,
    ReduceLevelSchema,
    ScanLevelSchema,
} from './schemas';

// Algoritmos paralelos genéricos (C3): módulos de suporte e kernels.

/** Alocação atômica numa lista compactada, com contagem do excedente (`AtomicAllocCounter`). */
export const atomicAlloc = wgslModule({
    name: 'atomic_alloc',
    source: atomicAllocSource,
    structs: [AtomicAllocCounterSchema],
});

/**
 * Slot vivo de um pool (spec 008): `pool_live(live[slot >> 5u], slot)` com o bitset de ocupação que a C2 mantém
 * (consumes `<chave do pool>.live`).
 */
export const poolLive = wgslModule({ name: 'pool_live', source: poolLiveSource });

/** Ponto fixo i32 com escala e saturação, para somas atômicas de valores reais. */
export const fixedPoint = wgslModule({ name: 'fixed_point', source: fixedPointSource });

/** Soma de prefixos: um nível, por grupo de 256, no lugar (subida). */
export const scanLocal = wgslModule({
    name: 'scan_local',
    source: scanLocalSource,
    structs: [ScanLevelSchema],
});

/** Soma de prefixos: nível de topo num grupo. */
export const scanTop = wgslModule({
    name: 'scan_top',
    source: scanTopSource,
    structs: [ScanLevelSchema],
});

/** Soma de prefixos: descida de um nível (soma o prefixo do grupo). */
export const scanCombine = wgslModule({
    name: 'scan_combine',
    source: scanCombineSource,
    structs: [ScanLevelSchema],
});

/** Ordenação radix: histograma de dígitos por grupo (dígito-maior). */
export const radixHistogram = wgslModule({
    name: 'radix_histogram',
    source: radixHistogramSource,
    structs: [RadixParamsSchema],
});

/** Ordenação radix: espalhamento estável (entradas só chaves e chaves com valores). */
export const radixScatter = wgslModule({
    name: 'radix_scatter',
    source: radixScatterSource,
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
            requires: [atomicAlloc, predicate],
            structs: [CompactParamsSchema],
        }),
        flags: wgslModule({
            name: `compact_flags:${predicate.name}`,
            source: compactFlagsSource,
            requires: [predicate],
            structs: [CompactParamsSchema],
        }),
        scatter: wgslModule({
            name: `compact_scatter:${predicate.name}`,
            source: compactScatterSource,
            requires: [predicate],
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
            requires: [reduceOp(op, type)],
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
    requires: [noise],
});

/** Coloração de arestas: preparação, grau e validação. */
export const gcInit = wgslModule({
    name: 'gc_init',
    source: gcInitSource,
    requires: [graphColor],
    structs: [GraphColorParamsSchema, GraphColorStatusSchema],
});

/** Coloração de arestas: subpasso da cor corrente (prioridade, atribuição, avanço). */
export const gcRound = wgslModule({
    name: 'gc_round',
    source: gcRoundSource,
    requires: [graphColor],
    structs: [GraphColorParamsSchema, GraphColorStatusSchema],
});

/** Coloração de arestas: agrupamento por cor (chaves da ordenação, contagens, intervalos). */
export const gcGroup = wgslModule({
    name: 'gc_group',
    source: gcGroupSource,
    structs: [GraphColorParamsSchema, GraphColorStatusSchema, ColorRangeSchema],
});

/** Grade hash espacial: célula de um ponto e o seu balde (`sh_cell`, `sh_hash`) e os parâmetros da grade. */
export const spatialHash = wgslModule({
    name: 'spatial_hash',
    source: spatialHashSource,
    structs: [HashGridParamsSchema],
});

/** Grade hash: contagem dos itens por balde. */
export const shCount = wgslModule({
    name: 'sh_count',
    source: shCountSource,
    requires: [spatialHash],
});

/** Grade hash: espalhamento dos índices nos baldes. */
export const shScatter = wgslModule({
    name: 'sh_scatter',
    source: shScatterSource,
    requires: [spatialHash],
});
