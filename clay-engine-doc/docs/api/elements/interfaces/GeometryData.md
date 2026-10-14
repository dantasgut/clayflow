[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / GeometryData

# Interface: GeometryData

Defined in: [elements/geometry/Geometry.ts:15](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/geometry/Geometry.ts#L15)

O que a base lê do `data` de uma geometria: vértices intercalados e índices (ausentes quando produzidos na GPU). As
subclasses estendem com os próprios campos.

## Extended by

- [`BoxGeometryData`](BoxGeometryData.md)
- [`SphereGeometryData`](SphereGeometryData.md)
- [`PlaneGeometryData`](PlaneGeometryData.md)
- [`PointCloudGeometryData`](PointCloudGeometryData.md)
- [`ParametricGeometryData`](ParametricGeometryData.md)
- [`SurfaceGeometryData`](SurfaceGeometryData.md)

## Properties

### indices?

> `optional` **indices?**: `Uint16Array`\<`ArrayBufferLike`\> \| `Uint32Array`\<`ArrayBufferLike`\>

Defined in: [elements/geometry/Geometry.ts:19](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/geometry/Geometry.ts#L19)

Índices de triângulo.

***

### vertices?

> `optional` **vertices?**: `Float32Array`\<`ArrayBufferLike`\>

Defined in: [elements/geometry/Geometry.ts:17](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/geometry/Geometry.ts#L17)

Vértices intercalados (posição, normal, uv).

***

### wireEdges?

> `optional` **wireEdges?**: `Uint32Array`\<`ArrayBufferLike`\>

Defined in: [elements/geometry/Geometry.ts:24](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/geometry/Geometry.ts#L24)

Arestas de arame (spec 008): pares de índices de vértice em espaço de objeto — o que o `WireframeMaterial` desenha
(de feição nas geometrias estáticas: sem as diagonais de faces planas).
