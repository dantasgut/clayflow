import { FieldType } from '../../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../../scene/descriptors/StructSchema';

/**
 * Schema do RigidBody integrado pelo LCPFlow (10 vec4f = 160B).
 * Layout casa byte-a-byte com o struct WGSL `RigidBody` em
 * `gpu/wgsl/structs/rigid_body.wgsl` consumido pelo kernel `rb_predict`.
 */
export const LCPSchema = new StructSchema('LCPSchema', {
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
