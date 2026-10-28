import { FieldType } from '../../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../../scene/descriptors/StructSchema';

/**
 * Schema da partícula SPH (5 vec4f = 80B).
 * Fonte única do struct WGSL `SPHParticle` (gerado deste schema pela montagem dos shaders) (pos.w=ρ, vel.w=p).
 * `contact`: o sólido mais próximo ao alcance do núcleo (normal para fora dele, distância com sinal em w; sem sólido,
 * normal zero) — escrito pela fronteira sólida a cada passo e lido pelo campo dos fluidos (a gota que molha).
 */
export const SPHSchema = new StructSchema(
    'SPHSchema',
    {
        pos: FieldType.vec4f,
        vel: FieldType.vec4f,
        force: FieldType.vec4f,
        color: FieldType.vec4f,
        contact: FieldType.vec4f,
    },
    { wgslName: 'SPHParticle' },
);
