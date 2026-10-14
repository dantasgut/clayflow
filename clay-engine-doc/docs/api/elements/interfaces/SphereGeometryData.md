[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SphereGeometryData

# Interface: SphereGeometryData

Defined in: [elements/geometry/SphereGeometry.ts:8](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/geometry/SphereGeometry.ts#L8)

Dado de uma `SphereGeometry`.

## Extends

- [`GeometryData`](GeometryData.md)

## Properties

### indexCount

> **indexCount**: `number`

Defined in: [elements/geometry/SphereGeometry.ts:12](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/geometry/SphereGeometry.ts#L12)

Número de índices.

***

### indices?

> `optional` **indices?**: `Uint16Array`\<`ArrayBufferLike`\> \| `Uint32Array`\<`ArrayBufferLike`\>

Defined in: [elements/geometry/Geometry.ts:19](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/geometry/Geometry.ts#L19)

Índices de triângulo.

#### Inherited from

[`GeometryData`](GeometryData.md).[`indices`](GeometryData.md#indices)

***

### latSegments

> **latSegments**: `number`

Defined in: [elements/geometry/SphereGeometry.ts:16](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/geometry/SphereGeometry.ts#L16)

Divisões em latitude.

***

### lonSegments

> **lonSegments**: `number`

Defined in: [elements/geometry/SphereGeometry.ts:18](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/geometry/SphereGeometry.ts#L18)

Divisões em longitude.

***

### radius

> **radius**: `number`

Defined in: [elements/geometry/SphereGeometry.ts:14](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/geometry/SphereGeometry.ts#L14)

Raio.

***

### vertexCount

> **vertexCount**: `number`

Defined in: [elements/geometry/SphereGeometry.ts:10](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/geometry/SphereGeometry.ts#L10)

Número de vértices.

***

### vertices?

> `optional` **vertices?**: `Float32Array`\<`ArrayBufferLike`\>

Defined in: [elements/geometry/Geometry.ts:17](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/geometry/Geometry.ts#L17)

Vértices intercalados (posição, normal, uv).

#### Inherited from

[`GeometryData`](GeometryData.md).[`vertices`](GeometryData.md#vertices)

***

### wireEdges?

> `optional` **wireEdges?**: `Uint32Array`\<`ArrayBufferLike`\>

Defined in: [elements/geometry/Geometry.ts:24](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/geometry/Geometry.ts#L24)

Arestas de arame (spec 008): pares de índices de vértice em espaço de objeto — o que o `WireframeMaterial` desenha
(de feição nas geometrias estáticas: sem as diagonais de faces planas).

#### Inherited from

[`GeometryData`](GeometryData.md).[`wireEdges`](GeometryData.md#wireedges)
