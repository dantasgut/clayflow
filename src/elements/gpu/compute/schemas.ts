import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';

/** Parâmetros de um nível da soma de prefixos (`PrefixSum`): contagem e modo (inclusiva só no nível 0). */
export const ScanLevelSchema = new StructSchema(
    'ScanLevel',
    {
        count: FieldType.u32,
        inclusive: FieldType.u32,
        _pad0: FieldType.u32,
        _pad1: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);

/** Contador de alocação atômica (`atomic_alloc`): posições concedidas e pedidos recusados por falta de espaço. */
export const AtomicAllocCounterSchema = new StructSchema('AtomicAllocCounter', {
    count: FieldType.atomicU32,
    overflow: FieldType.atomicU32,
});

/** Parâmetros de um passe da ordenação radix (`RadixSort`): elementos, deslocamento do dígito e grupos de 256. */
export const RadixParamsSchema = new StructSchema(
    'RadixParams',
    {
        count: FieldType.u32,
        shift: FieldType.u32,
        groups: FieldType.u32,
        _pad0: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);

/** Parâmetros de uma compactação (`Compaction`): elementos de entrada e capacidade da saída. */
export const CompactParamsSchema = new StructSchema(
    'CompactParams',
    {
        count: FieldType.u32,
        capacity: FieldType.u32,
        _pad0: FieldType.u32,
        _pad1: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);

/** Parâmetros de um nível da redução (`Reduce`): elementos e índice de saída do primeiro grupo. */
export const ReduceLevelSchema = new StructSchema(
    'ReduceLevel',
    {
        count: FieldType.u32,
        out_index: FieldType.u32,
        _pad0: FieldType.u32,
        _pad1: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);

/** Parâmetros da coloração de arestas (`GraphColorer`). */
export const GraphColorParamsSchema = new StructSchema(
    'GraphColorParams',
    {
        edge_count: FieldType.u32,
        vertex_count: FieldType.u32,
        max_colors: FieldType.u32,
        _pad0: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);

/**
 * Estado da coloração na GPU: cor corrente e subpasso (avançados por um único fio), cores usadas, candidatas e arestas
 * sem cor do último subpasso, e o resultado da validação (laços, índices inválidos, grau máximo).
 */
export const GraphColorStatusSchema = new StructSchema('GraphColorStatus', {
    color: FieldType.u32,
    step: FieldType.u32,
    color_count: FieldType.atomicU32,
    candidates: FieldType.atomicU32,
    uncolored: FieldType.atomicU32,
    loops: FieldType.atomicU32,
    invalid: FieldType.atomicU32,
    max_degree: FieldType.u32,
});

/** Intervalo das arestas de uma cor em `edgesByColor`. */
export const ColorRangeSchema = new StructSchema('ColorRange', {
    offset: FieldType.u32,
    count: FieldType.u32,
});

/**
 * Parâmetros da grade hash espacial (`SpatialHashGrid`, spec 007): itens, máscara da tabela (tamanho − 1, potência de
 * 2) e lado da célula.
 */
export const HashGridParamsSchema = new StructSchema(
    'HashGridParams',
    {
        count: FieldType.u32,
        table_mask: FieldType.u32,
        cell_size: FieldType.f32,
        _pad0: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);
