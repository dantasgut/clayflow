[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / SurfaceDiffSchema

# Variable: SurfaceDiffSchema

> `const` **SurfaceDiffSchema**: [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/elements/geometry/SurfaceSchemas.ts:9](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/SurfaceSchemas.ts#L9)

Geometria diferencial por vértice (spec 010): primeira forma (E, F, G e o determinante EG − F²), segunda forma
(L, M, N), curvaturas (gaussiana, média e principais k₁ ≥ k₂, sinal convexo positivo) e a direção principal de k₁
(xyz; w = 1 válida, 0 em ponto umbílico ou degenerado). Pool `SurfaceDiff`, escrito só pela GPU.
