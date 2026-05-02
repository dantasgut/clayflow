import { FieldType } from '../../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../../scene/descriptors/StructSchema';

/**
 * Schema do RigidBody integrado pelo XPBDFlow rigid (10 vec4f = 160B).
 * Layout idêntico ao LCPSchema (mesmo struct WGSL `RigidBody`); schema
 * separado para que pool keys distintas separem rigids LCP de rigids XPBD
 * coexistentes na mesma cena.
 */
export const XPBDRigidSchema = new StructSchema('XPBDRigidSchema', {
    pos: FieldType.vec4f,
    vel: FieldType.vec4f,
    omega: FieldType.vec4f,
    rot: FieldType.vec4f,
    I_inv: FieldType.vec4f,
    pos_pred: FieldType.vec4f,
    rot_pred: FieldType.vec4f,
    mat_props: FieldType.vec4f,
    body_shape: FieldType.vec4f,
    _rb_pad: FieldType.vec4f,
});
