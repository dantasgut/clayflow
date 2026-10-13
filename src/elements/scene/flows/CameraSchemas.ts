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

/** Parâmetros do estágio de câmera: início e tamanho da lista e a razão de aspecto do canvas. */
export const CameraComposeParamsSchema = new StructSchema(
    'CameraComposeParams',
    {
        first: FieldType.u32,
        count: FieldType.u32,
        canvas_aspect: FieldType.f32,
        _pad0: FieldType.u32,
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
