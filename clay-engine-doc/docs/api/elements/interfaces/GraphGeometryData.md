[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / GraphGeometryData

# Interface: GraphGeometryData

Defined in: [src/elements/geometry/GraphGeometry.ts:16](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/GraphGeometry.ts#L16)

Dado de uma `GraphGeometry`: as capacidades (os vértices e índices vivem só na GPU).

## Extends

- [`GeometryData`](GeometryData.md)

## Properties

### edgeCapacity

> **edgeCapacity**: `number`

Defined in: [src/elements/geometry/GraphGeometry.ts:19](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/GraphGeometry.ts#L19)

***

### indexCapacity

> **indexCapacity**: `number`

Defined in: [src/elements/geometry/GraphGeometry.ts:18](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/GraphGeometry.ts#L18)

***

### indices?

> `optional` **indices?**: `Uint32Array`\<`ArrayBufferLike`\> \| `Uint16Array`\<`ArrayBufferLike`\>

Defined in: [src/elements/geometry/Geometry.ts:19](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/Geometry.ts#L19)

Índices de triângulo.

#### Inherited from

[`GeometryData`](GeometryData.md).[`indices`](GeometryData.md#indices)

***

### vertexCapacity

> **vertexCapacity**: `number`

Defined in: [src/elements/geometry/GraphGeometry.ts:17](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/GraphGeometry.ts#L17)

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
