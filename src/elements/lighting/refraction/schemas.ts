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
 * O estado de um caminho da refração entre as rodadas da onda (spec 039, R17): o pixel e a folha (a identidade dele na
 * árvore de ramos), o estágio (o acerto da câmera, o caminho até a segunda interface, o caminho de um lobo, o lobo raro
 * olhado antes) e os passos nele; o raio seguinte (origem, direção, lado quanto aos volumes, canal), as interfaces, o
 * peso desde a câmera, o estado do sorteio e as marcas; a luz já somada pelos lobos raros resolvidos, a parte dela que
 * veio por algo em movimento e a energia truncada; na interface em que o lobo raro é olhado, o outro lobo (direção, lado,
 * peso, pilha) e o que decide entre eles (o número da roleta, a probabilidade da reflexão, o peso do raro); na interface
 * em que a dispersão começa, o que abre um caminho por canal; o acerto traçado (e a dielétrica coincidente) e as pilhas.
 */
export const RefractionPathSchema = new StructSchema('RefractionPathState', {
    pixel: FieldType.u32,
    leaf: FieldType.u32,
    stage: FieldType.u32,
    steps: FieldType.u32,
    origin: FieldType.vec3f,
    side: FieldType.i32,
    dir: FieldType.vec3f,
    channel: FieldType.i32,
    weight: FieldType.vec3f,
    interfaces: FieldType.u32,
    state: FieldType.u32,
    flags: FieldType.u32,
    look_u: FieldType.f32,
    p_reflect: FieldType.f32,
    gathered: FieldType.vec3f,
    rare_reflect: FieldType.u32,
    moving: FieldType.vec3f,
    other_side: FieldType.i32,
    truncated: FieldType.vec3f,
    other_crossed: FieldType.u32,
    other_dir: FieldType.vec3f,
    disperse: FieldType.u32,
    other_weight: FieldType.vec3f,
    disp_alpha: FieldType.f32,
    rare_weight: FieldType.vec3f,
    hit_t: FieldType.f32,
    disp_p: FieldType.vec3f,
    hit_face: FieldType.f32,
    disp_nf: FieldType.vec3f,
    hit_instance: FieldType.u32,
    disp_ns: FieldType.vec3f,
    hit_renderable: FieldType.u32,
    disp_m: FieldType.vec3f,
    hit_primitive: FieldType.u32,
    disp_d: FieldType.vec3f,
    other_instance: FieldType.u32,
    ior_before: FieldType.vec3f,
    other_face: FieldType.f32,
    ior_next: FieldType.vec3f,
    disp_f: FieldType.f32,
    disp_fv: FieldType.vec3f,
    disp_vol: FieldType.u32,
    hit_position: FieldType.vec3f,
    end_vol: FieldType.u32,
    hit_normal: FieldType.vec3f,
    end_pad: FieldType.u32,
    end: FieldType.vec4f,
    stack: fieldStruct(RefractionStackSchema),
    other_stack: fieldStruct(RefractionStackSchema),
});

/**
 * Uma folha da refração (spec 039, R17): o caminho que terminou — a chave (pixel × 64 + folha), se ela parou na interface
 * em que a dispersão começa (os canais continuam em outras folhas: não disputa o fim), a luz, a luminância da energia
 * truncada, a parte que veio por algo em movimento, o fim e o albedo nele.
 */
export const RefractionLeafSchema = new StructSchema('RefractionLeaf', {
    key: FieldType.u32,
    pending: FieldType.u32,
    truncated: FieldType.f32,
    pad: FieldType.f32,
    radiance: FieldType.vec3f,
    moved: FieldType.u32,
    moving: FieldType.vec3f,
    pad2: FieldType.u32,
    end: FieldType.vec4f,
    albedo: FieldType.vec3f,
    pad3: FieldType.u32,
});
