import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';

/** Luzes de área com sombra, no máximo: uma por canal dos alvos (r, g, b, a). */
export const AREA_SHADOW_MAX_LIGHTS = 4;
/** Formato da fração visível (um canal por luz). */
export const AREA_SHADOW_FORMAT: GPUTextureFormat = 'rgba16float';
/** Formato do ponto de mundo de cada texel (xyz; w: se vale, ou os quadros do histórico). */
export const AREA_SHADOW_POINT_FORMAT: GPUTextureFormat = 'rgba32float';
/** Quadros da média temporal. */
export const AREA_SHADOW_HISTORY = 32;
/** Os canais temporais (spec 037): a média e o ponto com os quadros do histórico. */
export const AREA_SHADOW_CHANNELS = ['accumulated', 'history'] as const;
/**
 * Os alvos sem histórico: o traçado do quadro, o ponto de cada texel, o par das passadas do filtro e a espessura
 * atravessada pela luz com o cosseno na saída (por luz; sem sorteio: um raio ao centro da fonte).
 */
export const AREA_SHADOW_TARGETS = [
    'traced',
    'point',
    'work',
    'output',
    'thickness',
    'entry',
] as const;

/** Parâmetros da sombra das luzes de área (uniform `AreaShadow`): a câmera da saída, as luzes vivas e os quadros da média. */
export const AreaShadowSchema = new StructSchema(
    'AreaShadow',
    {
        camera: FieldType.u32,
        count: FieldType.u32,
        history_max: FieldType.f32,
        _pad0: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);
