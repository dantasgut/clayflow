[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / PointCloudGeometryData

# Interface: PointCloudGeometryData

Defined in: [src/elements/geometry/PointCloudGeometry.ts:7](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/PointCloudGeometry.ts#L7)

Dado de uma `PointCloudGeometry`.

## Extends

- [`GeometryData`](GeometryData.md)

## Properties

### activeCount

> **activeCount**: `number`

Defined in: [src/elements/geometry/PointCloudGeometry.ts:11](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/PointCloudGeometry.ts#L11)

Pontos desenhados (os primeiros do buffer).

***

### indices?

> `optional` **indices?**: `Uint32Array`\<`ArrayBufferLike`\> \| `Uint16Array`\<`ArrayBufferLike`\>

Defined in: [src/elements/geometry/Geometry.ts:19](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/Geometry.ts#L19)

Índices de triângulo.

#### Inherited from

[`GeometryData`](GeometryData.md).[`indices`](GeometryData.md#indices)

***

### maxPoints

> **maxPoints**: `number`

Defined in: [src/elements/geometry/PointCloudGeometry.ts:9](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/PointCloudGeometry.ts#L9)

Pontos que cabem no buffer.

***

### vertices?

> `optional` **vertices?**: `Float32Array`\<`ArrayBufferLike`\>

Defined in: [src/elements/geometry/Geometry.ts:17](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/Geometry.ts#L17)

Vértices intercalados (posição, normal, uv).

#### Inherited from

[`GeometryData`](GeometryData.md).[`vertices`](GeometryData.md#vertices)

***

### wireEdges?

> `optional` **wireEdges?**: `Uint32Array`\<`ArrayBufferLike`\>

Defined in: [src/elements/geometry/Geometry.ts:24](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/Geometry.ts#L24)

Arestas de arame (spec 008): pares de índices de vértice em espaço de objeto — o que o `WireframeMaterial` desenha
(de feição nas geometrias estáticas: sem as diagonais de faces planas).

#### Inherited from

[`GeometryData`](GeometryData.md).[`wireEdges`](GeometryData.md#wireedges)
