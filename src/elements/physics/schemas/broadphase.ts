import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';

/** Par candidato da broadphase (spec 007): corpo e slot do collider no pool da sua forma. */
export const CandidatePairSchema = new StructSchema('CandidatePair', {
    body: FieldType.u32,
    slot: FieldType.u32,
});

/**
 * Parâmetros da broadphase do LCP (spec 007, research R9): contagens dos proxies (caixas, depois esferas), grandes,
 * capacidade de pares por forma, limiar de "grande", maior raio na grade e a margem preditiva
 * (`margin_scale × (|v| + |ω|·R + |g|·dt) · dt_sub + skin`).
 */
export const BroadphaseParamsSchema = new StructSchema(
    'BroadphaseParams',
    {
        box_count: FieldType.u32,
        sphere_count: FieldType.u32,
        large_count: FieldType.u32,
        pair_capacity: FieldType.u32,
        large_radius: FieldType.f32,
        max_small_radius: FieldType.f32,
        margin_scale: FieldType.f32,
        skin: FieldType.f32,
        substeps: FieldType.u32,
        _pad0: FieldType.u32,
        _pad1: FieldType.u32,
        _pad2: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);

/** Contagens de pares candidatos por forma e o excedente (atômicos), zeradas a cada passo. */
export const CandidatePairCountsSchema = new StructSchema('CandidatePairCounts', {
    boxes: FieldType.atomicU32,
    spheres: FieldType.atomicU32,
    overflow: FieldType.atomicU32,
    _pad0: FieldType.u32,
});

/** Argumentos do despacho indireto da narrowphase (grupos x/y/z das caixas e das esferas). */
export const NarrowphaseDispatchSchema = new StructSchema('NarrowphaseDispatch', {
    box_x: FieldType.u32,
    box_y: FieldType.u32,
    box_z: FieldType.u32,
    _pad0: FieldType.u32,
    sphere_x: FieldType.u32,
    sphere_y: FieldType.u32,
    sphere_z: FieldType.u32,
    _pad1: FieldType.u32,
});
