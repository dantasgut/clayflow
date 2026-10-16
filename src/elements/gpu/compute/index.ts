// Algoritmos paralelos genéricos na GPU (spec 005, US4): blocos dos estágios do motor — soma de prefixos, ordenação,
// compactação, redução e coloração de grafo. Cada um aloca pela capacidade, grava num `Frame` (a coloração, assíncrona,
// faz os próprios envios) e não despacha com contagem 0.
export { PrefixSum, scanLevelCounts, SCAN_GROUP } from './PrefixSum';
export type { PrefixSumOptions, PrefixSumRecordArgs } from './PrefixSum';
export { CountToArgs } from './CountToArgs';
export type { CountToArgsOptions, CountToArgsRecordArgs, GpuCount } from './CountToArgs';
export { RadixSort } from './RadixSort';
export type { RadixSortOptions, RadixSortRecordArgs } from './RadixSort';
export { Compaction } from './Compaction';
export type { CompactionOptions, CompactionRecordArgs } from './Compaction';
export { Reduce, reduceLevelCounts } from './Reduce';
export type { ReduceOptions, ReduceRecordArgs } from './Reduce';
export { GraphColorer, verifyEdgeColoring } from './GraphColorer';
export type {
    ColorRangeCpu,
    EdgeColoringVerdict,
    GraphColoring,
    GraphColorerOptions,
} from './GraphColorer';
export { reduceOp, compactionModules } from './shaders';
export type { ReduceOpName, ReduceType, CompactionModules } from './shaders';
export {
    AtomicAllocCounterSchema,
    ColorRangeSchema,
    CountToArgsParamsSchema,
    ScanLevelSchema,
} from './schemas';
