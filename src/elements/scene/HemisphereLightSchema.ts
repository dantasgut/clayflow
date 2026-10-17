import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/** Parâmetros da `HemisphereLight` (uniform): cores do céu e do chão, eixo para cima e intensidade (spec 011). */
export const HemisphereLightSchema = new StructSchema(
    'HemisphereLight',
    {
        skyColor: FieldType.vec4f,
        groundColor: FieldType.vec4f,
        up: FieldType.vec4f,
        intensity: FieldType.f32,
    },
    { addressSpace: 'uniform' },
);
