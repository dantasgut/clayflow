import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';

/**
 * Baldes do hash das cáusticas: 2¹⁹ células (os quatro níveis de um chão de 4 × 4 m todo aceso em células de 1 cm
 * ocupam ~40 %).
 */
export const CAUSTICS_SLOTS = 1 << 19;
/** Palavras por balde (`caustics_common.wgsl`): a chave, a soma, a irradiância, os fótons do quadro e os acumulados. */
export const CAUSTICS_BUCKET_WORDS = 10;
/** Palavras do buffer das cáusticas: o cabeçalho (8) e os baldes. */
export const CAUSTICS_BUFFER_WORDS = 8 + CAUSTICS_SLOTS * CAUSTICS_BUCKET_WORDS;
/** f32 da lista dos alvos dos fótons (`caustics_trace.wgsl`: cabeçalho, 64 caixas, áreas de 8 luzes × 64). */
export const CAUSTICS_TARGET_WORDS = 8 + 8 * 64 + 8 * 64;

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
