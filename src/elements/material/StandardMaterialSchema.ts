import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/** Uniform do material padrão (albedo, rugosidade, metalicidade). */
export const StandardMaterialSchema = new StructSchema('StandardMaterial', {
    albedo: FieldType.vec4f,
    roughness: FieldType.f32,
    metallic: FieldType.f32,
    _pad0: FieldType.f32,
    _pad1: FieldType.f32,
});
