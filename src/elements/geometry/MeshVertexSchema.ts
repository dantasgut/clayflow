import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/**
 * Vértice de malha lido e escrito em compute e no vértice por storage (spec 031, R10): oito `f32` escalares — posição,
 * normal e uv — com o mesmo layout de 32 B do buffer de vértices das geometrias (`SurfaceVertex` no desenho). Campos
 * escalares porque `vec3f` em storage alinha a 16 B: com eles a malha é `array<MeshVertex>`, sem offsets à mão.
 */
export const MeshVertexSchema = new StructSchema('MeshVertex', {
    px: FieldType.f32,
    py: FieldType.f32,
    pz: FieldType.f32,
    nx: FieldType.f32,
    ny: FieldType.f32,
    nz: FieldType.f32,
    u: FieldType.f32,
    v: FieldType.f32,
});
