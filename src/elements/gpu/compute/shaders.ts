import { wgslModule } from '../../../scene/shaders/WgslModule';
import scanLocalSource from './wgsl/scan_local.wgsl?raw';
import scanTopSource from './wgsl/scan_top.wgsl?raw';
import scanCombineSource from './wgsl/scan_combine.wgsl?raw';
import atomicAllocSource from './wgsl/atomic_alloc.wgsl?raw';
import fixedPointSource from './wgsl/fixed_point.wgsl?raw';
import { AtomicAllocCounterSchema, ScanLevelSchema } from './schemas';

// Algoritmos paralelos genéricos (C3): módulos de suporte e kernels.

/** Alocação atômica numa lista compactada, com contagem do excedente (`AtomicAllocCounter`). */
export const atomicAlloc = wgslModule({
    name: 'atomic_alloc',
    source: atomicAllocSource,
    structs: [AtomicAllocCounterSchema],
});

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
