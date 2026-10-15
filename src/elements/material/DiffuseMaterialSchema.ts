import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/** Pool do material das partículas secundárias (cores por tipo e raios: spray, espuma, bolha), spec 010. */
export const DiffuseMaterialSchema = new StructSchema('DiffuseMaterial', {
    spray_color: FieldType.vec4f,
    foam_color: FieldType.vec4f,
    bubble_color: FieldType.vec4f,
    radii: FieldType.vec4f,
});
