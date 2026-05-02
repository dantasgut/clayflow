import { FieldType } from '../../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../../scene/descriptors/StructSchema';

/**
 * Schema da partícula MPM aplicada a fluidos (8 vec4f = 128B).
 * Layout idêntico ao MPMSoftSchema (mesmo struct WGSL `MPMParticle`); schema
 * separado para que fluidos MPM coexistam em pool distinta de softs MPM com
 * parâmetros constitutivos distintos no mesmo frame.
 */
export const MPMFluidSchema = new StructSchema('MPMFluidSchema', {
    pos: FieldType.vec4f,
    vel: FieldType.vec4f,
    F_col0: FieldType.vec4f,
    F_col1: FieldType.vec4f,
    F_col2: FieldType.vec4f,
    C_col0: FieldType.vec4f,
    C_col1: FieldType.vec4f,
    C_col2: FieldType.vec4f,
});
