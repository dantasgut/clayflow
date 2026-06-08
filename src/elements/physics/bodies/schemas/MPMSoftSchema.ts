import { FieldType } from '../../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../../scene/descriptors/StructSchema';

/**
 * Schema da partícula MPM aplicada a soft bodies (8 vec4f = 128B).
 * Layout casa byte-a-byte com o struct WGSL `MPMParticle` em
 * `gpu/wgsl/structs/mpm_particle.wgsl`. Inclui gradiente de deformação F
 * (3 colunas) e matriz APIC C (3 colunas) usadas em P2G/G2P.
 */
export const MPMSoftSchema = new StructSchema('MPMSoftSchema', {
    pos: FieldType.vec4f,
    vel: FieldType.vec4f,
    F_col0: FieldType.vec4f,
    F_col1: FieldType.vec4f,
    F_col2: FieldType.vec4f,
    C_col0: FieldType.vec4f,
    C_col1: FieldType.vec4f,
    C_col2: FieldType.vec4f,
});
