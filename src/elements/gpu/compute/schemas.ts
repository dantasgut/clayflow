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
