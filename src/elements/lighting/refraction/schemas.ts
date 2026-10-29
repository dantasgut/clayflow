import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema, fieldArray, fieldStruct } from '../../../scene/descriptors/StructSchema';
import { REFRACTION_MAX_MEDIA } from './Refraction';

/** Um meio da pilha de um caminho (spec 034, R1): a instância, a prioridade, o índice por canal e a absorção por canal. */
export const RefractionMediumSchema = new StructSchema('RefractionMedium', {
    instance: FieldType.u32,
    priority: FieldType.f32,
    ior: FieldType.vec3f,
    sigma: FieldType.vec3f,
});

/**
 * Pilha de meios de um caminho: em ordem de entrada, até `REFRACTION_MAX_MEDIA`; `overflow` 1 quando um meio além do
 * teto não coube. Guardada no estado de cada caminho entre as rodadas da onda (spec 039).
 */
export const RefractionStackSchema = new StructSchema('RefractionStack', {
    media: fieldArray(fieldStruct(RefractionMediumSchema), REFRACTION_MAX_MEDIA.value),
    count: FieldType.u32,
    overflow: FieldType.u32,
});

/**
 * O estado de uma vaga da refração com trabalho fixo por pixel (spec 039 refeita, D1): o pixel (`NONE` vaga vazia), se
 * segue viva, o canal (−1 os três), o lado quanto aos volumes, o raio seguinte, as interfaces, o peso desde a câmera, o
 * estado do sorteio, as marcas e os passos; a luz somada, a energia truncada, a parte em movimento, o fim e o albedo
 * nele; o acerto traçado na rodada (e a dielétrica coincidente) e a pilha de meios.
 */
export const RefractionChainSchema = new StructSchema('RefractionChainState', {
    pixel: FieldType.u32,
    alive: FieldType.u32,
    channel: FieldType.i32,
    side: FieldType.i32,
    origin: FieldType.vec3f,
    interfaces: FieldType.u32,
    dir: FieldType.vec3f,
    state: FieldType.u32,
    weight: FieldType.vec3f,
    flags: FieldType.u32,
    radiance: FieldType.vec3f,
    steps: FieldType.u32,
    truncated: FieldType.vec3f,
    hit_instance: FieldType.u32,
    moving: FieldType.vec3f,
    hit_t: FieldType.f32,
    end: FieldType.vec4f,
    albedo: FieldType.vec3f,
    hit_face: FieldType.f32,
    hit_position: FieldType.vec3f,
    hit_renderable: FieldType.u32,
    hit_normal: FieldType.vec3f,
    hit_primitive: FieldType.u32,
    other_instance: FieldType.u32,
    other_face: FieldType.f32,
    pad0: FieldType.u32,
    pad1: FieldType.u32,
    stack: fieldStruct(RefractionStackSchema),
});
