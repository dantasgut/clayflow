import { FieldType } from '../../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../../scene/descriptors/StructSchema';

/**
 * Schema da partícula PBF (4 vec4f = 64B).
 * Fonte única do struct WGSL `PBFParticle` (gerado deste schema pela montagem dos shaders) (pos.w=lambda, curl=vorticity).
 */
export const PBFSchema = new StructSchema(
    'PBFSchema',
    {
        pos: FieldType.vec4f,
        vel: FieldType.vec4f,
        posOld: FieldType.vec4f,
        curl: FieldType.vec4f,
    },
    { wgslName: 'PBFParticle' },
);
