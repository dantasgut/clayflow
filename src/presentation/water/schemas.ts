import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

// Schemas dos estágios da água e das cáusticas (spec 017), na Camada 4 com o `WaterSurface` que os possui.

/**
 * Vista de um produtor de superfície de água (spec 017; spec 033: a marcha no campo): câmera (`view` = 0, matrizes do
 * pool `CameraMatrices` no `cameraSlot`) ou luz (`view` = 1, direção do pool `ShadowMatrix` no `shadowSlot`) e o tamanho
 * do alvo.
 */
export const WaterViewParamsSchema = new StructSchema(
    'WaterViewParams',
    {
        cameraSlot: FieldType.u32,
        shadowSlot: FieldType.u32,
        view: FieldType.u32,
        _pad0: FieldType.u32,
        viewport: FieldType.vec2f,
        _pad1: FieldType.f32,
        _pad2: FieldType.f32,
    },
    { addressSpace: 'uniform' },
);

/**
 * Enquadramento da vista da luz da água (spec 017, produzido na GPU): a direção da luz que projeta sombra com a
 * projeção ortográfica ajustada à caixa da água (a do campo dos fluidos, spec 033).
 */
export const WaterLightMatrixSchema = new StructSchema('WaterLightMatrix', {
    viewProj: FieldType.mat4x4f,
});

/**
 * Cáusticas (spec 017): slot do mapa de sombra da luz, tamanho do mapa de cáusticas (= superfície vista pela luz) e o
 * tempo da cena (ondulações do material).
 */
export const CausticParamsSchema = new StructSchema(
    'CausticParams',
    {
        shadowSlot: FieldType.u32,
        width: FieldType.u32,
        height: FieldType.u32,
        /** Tempo da cena (s): fase das ondulações do material. */
        time: FieldType.f32,
    },
    { addressSpace: 'uniform' },
);

/**
 * Composição da água (spec 017): slot da câmera, tamanho do alvo e o tempo da cena (ondulações do material). A luz e a
 * sombra vêm dos pontos de cena do sombreamento (spec 031), não daqui.
 */
export const WaterCompositeParamsSchema = new StructSchema(
    'WaterCompositeParams',
    {
        cameraSlot: FieldType.u32,
        /** Tempo da cena (s): fase das ondulações do material. */
        time: FieldType.f32,
        viewport: FieldType.vec2f,
        /** 1 quando a refração traçada do quadro está pronta (spec 034); 0: a cena deslocada. */
        traced: FieldType.u32,
        _pad0: FieldType.u32,
        _pad1: FieldType.u32,
        _pad2: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);

/**
 * Estado da superfície de água lido pelos desenhos da cena (spec 031, descritor `state` do `WaterSurface`): `caustics`
 * = 1 quando a superfície vista pela luz foi produzida no quadro (as cáusticas valem para a luz direta abaixo da água);
 * 0 deixa a transmissão da luz em `vec3f(ambient + direct)` exato.
 */
export const WaterStateSchema = new StructSchema(
    'WaterState',
    {
        caustics: FieldType.u32,
        _pad0: FieldType.u32,
        _pad1: FieldType.u32,
        _pad2: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);
