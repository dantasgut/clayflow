import { FieldType } from '../../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../../scene/descriptors/StructSchema';

/**
 * Schema do SoftBody integrado pelo XPBDFlow soft (3 vec4f = 48B).
 * Layout casa byte-a-byte com o struct WGSL `Particle` em
 * `gpu/wgsl/structs/particle.wgsl` (pos.w=invMass; pred/vel reservados).
 */
export const XPBDSoftSchema = new StructSchema('XPBDSoftSchema', {
    pos: FieldType.vec4f,
    pred: FieldType.vec4f,
    vel: FieldType.vec4f,
});
