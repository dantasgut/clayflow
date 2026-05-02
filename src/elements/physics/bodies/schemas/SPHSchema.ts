import { FieldType } from '../../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../../scene/descriptors/StructSchema';

/**
 * Schema da partícula SPH (4 vec4f = 64B).
 * Layout casa byte-a-byte com o struct WGSL `SPHParticle` em
 * `gpu/wgsl/structs/sph_particle.wgsl` (pos.w=ρ, vel.w=p).
 */
export const SPHSchema = new StructSchema('SPHSchema', {
    pos: FieldType.vec4f,
    vel: FieldType.vec4f,
    force: FieldType.vec4f,
    color: FieldType.vec4f,
});
