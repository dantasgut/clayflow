import { FieldType } from '../../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../../scene/descriptors/StructSchema';

/**
 * Schema da partícula PBF (4 vec4f = 64B).
 * Layout casa byte-a-byte com o struct WGSL `PBFParticle` em
 * `gpu/wgsl/structs/pbf_particle.wgsl` (pos.w=lambda, curl=vorticity).
 */
export const PBFSchema = new StructSchema('PBFSchema', {
    pos: FieldType.vec4f,
    vel: FieldType.vec4f,
    posOld: FieldType.vec4f,
    curl: FieldType.vec4f,
});
