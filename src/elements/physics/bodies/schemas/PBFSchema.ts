import { FieldType } from '../../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../../scene/descriptors/StructSchema';

/**
 * Schema da partícula PBF (5 vec4f = 80B).
 * Fonte única do struct WGSL `PBFParticle` (gerado deste schema pela montagem dos shaders) (pos.w=lambda, curl=vorticity).
 * `contact`: o sólido mais próximo ao alcance do núcleo (normal para fora dele, distância com sinal em w; sem sólido,
 * normal zero) — escrito pela fronteira sólida a cada iteração do solver e lido pelo campo dos fluidos (spec 034).
 */
export const PBFSchema = new StructSchema(
    'PBFSchema',
    {
        pos: FieldType.vec4f,
        vel: FieldType.vec4f,
        posOld: FieldType.vec4f,
        curl: FieldType.vec4f,
        contact: FieldType.vec4f,
    },
    { wgslName: 'PBFParticle' },
);
