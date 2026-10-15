[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SurfaceDiffSchema

# Variable: SurfaceDiffSchema

> `const` **SurfaceDiffSchema**: `StructSchema`

Defined in: [elements/geometry/SurfaceSchemas.ts:16](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/SurfaceSchemas.ts#L16)

Geometria diferencial por vértice (spec 010): primeira forma (E, F, G e o determinante EG − F²), segunda forma
(L, M, N), curvaturas (gaussiana, média e principais k₁ ≥ k₂, sinal convexo positivo) e a direção principal de k₁
(xyz; w = 1 válida, 0 em ponto umbílico ou degenerado). Pool `SurfaceDiff`, escrito só pela GPU.
