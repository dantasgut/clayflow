import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/** Parâmetros da busca de vizinhança (grade de hashing espacial). */
export const NsSimParamsSchema = new StructSchema(
    'NsSimParams',
    {
        origin: FieldType.vec3f,
        cell_size: FieldType.f32,
        grid_x: FieldType.u32,
        grid_y: FieldType.u32,
        grid_z: FieldType.u32,
        cell_count: FieldType.u32,
        particle_count: FieldType.u32,
        particle_stride: FieldType.u32,
        max_neighbors: FieldType.u32,
        /** Passo da lista de vizinhos intercalada: o vizinho `k` da partícula `i` está em `k * list_stride + i`. */
        list_stride: FieldType.u32,
        /**
         * 1: a busca roda e grava na ordem por célula (`ns_order`) — o vizinho `k` do posto `t` (a partícula
         * `ns_order[t] − 1`) em `k * list_stride + t`; 0: pelo índice da partícula.
         */
        by_rank: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);
