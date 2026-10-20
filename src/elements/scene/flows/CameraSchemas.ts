import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import type { EntityRecordDeclaration } from '../../../scene/flows/slots';
import { Camera } from '../Camera';
import { Transform } from '../Transform';

/** Registro de cada câmera com `Transform` (spec 007): slot dos parâmetros/matrizes e slot da matriz de mundo. */
export const CameraRecordSchema = new StructSchema('CameraRecord', {
    cameraSlot: FieldType.u32,
    transformSlot: FieldType.u32,
});

/** Lista das câmeras vivas (grupo único da C2): o estágio percorre só câmeras presentes. */
export const CameraInstanceSchema = new StructSchema('CameraInstance', { record: FieldType.u32 });

/**
 * Parâmetros do estágio de câmera: início e tamanho da lista, a razão de aspecto do canvas e o deslocamento da amostra
 * dentro do pixel do quadro (spec 034: xy em NDC, zw em pixels; zero sem antisserrilhado temporal).
 */
export const CameraComposeParamsSchema = new StructSchema(
    'CameraComposeParams',
    {
        first: FieldType.u32,
        count: FieldType.u32,
        canvas_aspect: FieldType.f32,
        _pad0: FieldType.u32,
        jitter: FieldType.vec4f,
    },
    { addressSpace: 'uniform' },
);

/** Declaração do registro `CameraRecord` (slots dos descritores `camera` e `world`). */
export const cameraRecord: EntityRecordDeclaration = {
    schema: CameraRecordSchema,
    fields: {
        cameraSlot: [Camera, 'camera'],
        transformSlot: [Transform, 'world'],
    },
};

/**
 * Câmera com função `camera` (spec 009) na lista do estágio: slot dos parâmetros/matrizes, slot da matriz de mundo e
 * slot do registro da função no pool da forma dela (spec 031, R8).
 */
export const CameraFnEntrySchema = new StructSchema('CameraFnEntry', {
    camera: FieldType.u32,
    world: FieldType.u32,
    record: FieldType.u32,
});

/** Trecho de um grupo de função na lista de câmeras, tempo simulado e razão do canvas (spec 009). */
export const CameraFnGroupSchema = new StructSchema(
    'CameraFnGroup',
    {
        first: FieldType.u32,
        count: FieldType.u32,
        time: FieldType.f32,
        canvas_aspect: FieldType.f32,
        /** O deslocamento da amostra do quadro (o mesmo do estágio padrão). */
        jitter: FieldType.vec4f,
    },
    { addressSpace: 'uniform' },
);
