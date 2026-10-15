[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SurfaceGeometryData

# Interface: SurfaceGeometryData

Defined in: [elements/geometry/SurfaceGeometry.ts:8](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/SurfaceGeometry.ts#L8)

Dado de uma `SurfaceGeometry`.

## Extends

- [`GeometryData`](GeometryData.md)

## Properties

### adjacency

> **adjacency**: `Uint32Array`

Defined in: [elements/geometry/SurfaceGeometry.ts:17](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/SurfaceGeometry.ts#L17)

Adjacência vértice → triângulos (CSR): `vertexCount + 1` inícios seguidos dos triângulos de cada vértice — o que o
kernel de normais soma por vértice.

***

### indexCount

> **indexCount**: `number`

Defined in: [elements/geometry/SurfaceGeometry.ts:21](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/SurfaceGeometry.ts#L21)

Número de índices.

***

### indices

> **indices**: `Uint32Array`

Defined in: [elements/geometry/SurfaceGeometry.ts:12](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/SurfaceGeometry.ts#L12)

Triângulos (índices locais de vértice).

#### Overrides

[`GeometryData`](GeometryData.md).[`indices`](GeometryData.md#indices)

***

### vertexCount

> **vertexCount**: `number`

Defined in: [elements/geometry/SurfaceGeometry.ts:19](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/SurfaceGeometry.ts#L19)

Número de vértices.

***

### vertices

> **vertices**: `Float32Array`

Defined in: [elements/geometry/SurfaceGeometry.ts:10](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/SurfaceGeometry.ts#L10)

Vértices intercalados (posição, normal, uv; 8 floats): o estado inicial; depois a GPU escreve posição e normal.

#### Overrides

[`GeometryData`](GeometryData.md).[`vertices`](GeometryData.md#vertices)

***

### wireEdges?

> `optional` **wireEdges?**: `Uint32Array`\<`ArrayBufferLike`\>

Defined in: [elements/geometry/Geometry.ts:24](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/Geometry.ts#L24)

Arestas de arame (spec 008): pares de índices de vértice em espaço de objeto — o que o `WireframeMaterial` desenha
(de feição nas geometrias estáticas: sem as diagonais de faces planas).

#### Inherited from

[`GeometryData`](GeometryData.md).[`wireEdges`](GeometryData.md#wireedges)
