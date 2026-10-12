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

/** Gradiente de deformação em repouso (identidade) — estado inicial de toda partícula MPM criada pela fachada. */
export const MPM_REST_DEFORMATION: Readonly<
    Record<'F_col0' | 'F_col1' | 'F_col2', readonly number[]>
> = {
    F_col0: [1, 0, 0, 0],
    F_col1: [0, 1, 0, 0],
    F_col2: [0, 0, 1, 0],
};
