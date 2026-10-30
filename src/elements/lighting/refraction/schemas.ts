import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema, fieldArray, fieldStruct } from '../../../scene/descriptors/StructSchema';
import { REFRACTION_MAX_MEDIA } from './Refraction';

/**
 * Um meio da pilha de um caminho (spec 034, R1): a instância, a prioridade, o índice por canal e a absorção por canal —
 * em escalares (32 bytes; com `vec3f` o alinhamento dava 48): as pilhas vão em cada vaga do traçado, lidas e gravadas
 * em cada rodada. O WGSL os lê por `refraction_medium_ior` e `refraction_medium_sigma`.
 */
export const RefractionMediumSchema = new StructSchema('RefractionMedium', {
    instance: FieldType.u32,
    priority: FieldType.f32,
    ior_r: FieldType.f32,
    ior_g: FieldType.f32,
    ior_b: FieldType.f32,
    sigma_r: FieldType.f32,
    sigma_g: FieldType.f32,
    sigma_b: FieldType.f32,
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
 * nele; o acerto traçado na rodada (e a dielétrica coincidente); o ângulo do pixel e a distância percorrida desde a
 * câmera; e a pilha de meios. A dispersão adiada fica à parte, na `RefractionSplitSchema` da mesma vaga: a vaga é lida
 * e gravada inteira em cada rodada, e a dispersão só conta enquanto adiada.
 */
/**
 * O registro de um bloco 2×2 da meia resolução (spec 039 refeita): o resultado do representante traçado no quadro — a
 * radiância e a energia truncada, o fim (o guia), o albedo e a marca de movimento — e (o quadro, o pixel em 16 + 16
 * bits, a distância e as marcas do pedido nele), lidos pela reconstrução.
 */
export const RefractionBlockSchema = new StructSchema('RefractionBlock', {
    radiance: FieldType.vec4f,
    end: FieldType.vec4f,
    albedo: FieldType.vec4f,
    tag: FieldType.vec4u,
});

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
    spread: FieldType.f32,
    travelled: FieldType.f32,
    stack: fieldStruct(RefractionStackSchema),
});

/**
 * A dispersão adiada de uma vaga (spec 039 refeita), ao lado do estado dela (`RefractionChainSchema`, o mesmo índice),
 * válida com a marca `REFRACTION_CHAIN_SPLIT`: o ponto e o lado da interface em que ela começou, as direções do vermelho
 * e do azul e o peso dos canais ali; o ângulo entre os canais agora e o afastamento acumulado deles; a pilha de meios
 * ali, de onde os canais recomeçam.
 */
export const RefractionSplitSchema = new StructSchema('RefractionSplit', {
    origin: FieldType.vec3f,
    side: FieldType.i32,
    red: FieldType.vec3f,
    angle: FieldType.f32,
    blue: FieldType.vec3f,
    offset: FieldType.f32,
    weight: FieldType.vec3f,
    pad0: FieldType.u32,
    stack: fieldStruct(RefractionStackSchema),
});
