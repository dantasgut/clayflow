import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/** Pool do material de sprites (cor e raio em unidades de mundo), lido como `array<PointSpriteMaterial>` (spec 008). */
export const PointSpriteMaterialSchema = new StructSchema('PointSpriteMaterial', {
    color: FieldType.vec4f,
    radius: FieldType.f32,
    _pad0: FieldType.f32,
    _pad1: FieldType.f32,
    _pad2: FieldType.f32,
});
