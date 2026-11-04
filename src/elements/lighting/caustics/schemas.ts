import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';

/**
 * Baldes do hash das cáusticas: 2²¹, em seis faixas iguais, uma por nível (`caustics_common.wgsl`) — a faixa do nível fino
 * (células de 5 mm) comporta ~2 m² de cáustica acesa.
 */
export const CAUSTICS_SLOTS = 1 << 21;
/** Palavras por balde (`caustics_common.wgsl`): a chave, a soma do quadro e a irradiância. */
export const CAUSTICS_BUCKET_WORDS = 7;
/** Palavras do buffer das cáusticas: o cabeçalho (12) e os baldes. */
export const CAUSTICS_BUFFER_WORDS = 12 + CAUSTICS_SLOTS * CAUSTICS_BUCKET_WORDS;
/**
 * f32 da lista dos alvos dos fótons (`caustics_trace.wgsl`: cabeçalho com a âncora, 64 caixas, áreas de 8 luzes × 64, a
 * contagem dos segmentos da grade e 576 segmentos de 8 palavras).
 */
export const CAUSTICS_TARGET_WORDS = 1040 + 8 * 576;

/**
 * Parâmetros das cáusticas (uniform, spec 034 T067c): `counts` = (slots usados do pool `Light`, baldes do hash, fótons
 * do quadro, quadro); `extra` = (lado da célula do hash em m, tempo simulado, 0, 0).
 */
export const CausticsSchema = new StructSchema(
    'Caustics',
    {
        counts: FieldType.vec4u,
        extra: FieldType.vec4f,
    },
    { addressSpace: 'uniform' },
);

/** Palavra de 32 bits (o tamanho do descritor do hash). */
export const CausticsWordSchema = new StructSchema('CausticsWord', { value: FieldType.u32 });

/** Rebotes dos fótons: as rodadas da onda (cada uma traça, avalia o material e segue os fótons vivos). */
export const CAUSTICS_BOUNCES = 6;

/** Fótons na fila por fóton principal: ele e, numa interface com dispersão, os outros dois canais. */
export const CAUSTICS_PHOTON_SLOTS = 3;

/** Palavras do cabeçalho da fila dos fótons (`caustics_trace.wgsl`: `CAUSTICS_QUEUE_LISTS`). */
export const CAUSTICS_QUEUE_HEADER = 8;

/**
 * Um fóton entre as rodadas (spec 039): a origem do próximo trecho e o índice do meio em que está, a direção e o lado da
 * origem quanto aos volumes (−1 sem saber; 0 fora e 1 dentro ao partir da superfície de um), a vazão e o canal (3 = os
 * três; 0–2 depois da dispersão; 4 = parou), a absorção do meio homogêneo da água em que está (0 no ar; a transmitância de
 * cada trecho é analítica pelo comprimento, spec 039 T110) e se está dentro de uma malha (o vidro, onde a água não
 * absorve), o estado do sorteio e os rebotes especulares até aqui; o pouso na difusa (o ponto, o último trecho, a
 * normal), a assinatura do caminho (as interfaces e os lobos), o caminho percorrido e se pousou (spec 034: a malha de
 * fótons).
 */
export const CausticsPhotonSchema = new StructSchema('CausticsPhoton', {
    origin: FieldType.vec3f,
    medium: FieldType.f32,
    dir: FieldType.vec3f,
    side: FieldType.i32,
    throughput: FieldType.vec3f,
    channel: FieldType.u32,
    absorption: FieldType.vec3f,
    glass: FieldType.u32,
    state: FieldType.u32,
    specular: FieldType.u32,
    travel: FieldType.f32,
    landed: FieldType.u32,
    land: FieldType.vec3f,
    land_t: FieldType.f32,
    land_n: FieldType.vec3f,
    sig: FieldType.u32,
});

/**
 * Fótons por bloco da onda no máximo (2¹⁸: 116 MiB de entradas da onda) — o orçamento de memória de um bloco; o
 * dispositivo pode limitar a menos (a ligação de storage).
 */
export const CAUSTICS_WAVE_CHUNK = 1 << 18;
