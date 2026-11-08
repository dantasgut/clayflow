[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / MeshVertexSchema

# Variable: MeshVertexSchema

> `const` **MeshVertexSchema**: [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/elements/geometry/MeshVertexSchema.ts:9](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/MeshVertexSchema.ts#L9)

Vértice de malha lido e escrito em compute e no vértice por storage (spec 031, R10): oito `f32` escalares — posição,
normal e uv — com o mesmo layout de 32 B do buffer de vértices das geometrias (`SurfaceVertex` no desenho). Campos
escalares porque `vec3f` em storage alinha a 16 B: com eles a malha é `array<MeshVertex>`, sem offsets à mão.
