import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/** Pool do material de arame (cor e espessura em pixels), lido como `array<WireframeMaterial>` (spec 008). */
export const WireframeMaterialSchema = new StructSchema('WireframeMaterial', {
    color: FieldType.vec4f,
    lineWidth: FieldType.f32,
    _pad0: FieldType.f32,
    _pad1: FieldType.f32,
    _pad2: FieldType.f32,
});
