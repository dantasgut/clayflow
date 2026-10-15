[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / BoxGeometryData

# Interface: BoxGeometryData

Defined in: [elements/geometry/BoxGeometry.ts:8](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/geometry/BoxGeometry.ts#L8)

Dado de uma `BoxGeometry`.

## Extends

- [`GeometryData`](GeometryData.md)

## Properties

### indexCount

> **indexCount**: `number`

Defined in: [elements/geometry/BoxGeometry.ts:12](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/geometry/BoxGeometry.ts#L12)

Número de índices.

***

### indices?

> `optional` **indices?**: `Uint16Array`\<`ArrayBufferLike`\> \| `Uint32Array`\<`ArrayBufferLike`\>

Defined in: [elements/geometry/Geometry.ts:19](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/geometry/Geometry.ts#L19)

Índices de triângulo.

#### Inherited from

[`GeometryData`](GeometryData.md).[`indices`](GeometryData.md#indices)

***

### size

> **size**: readonly `number`[]

Defined in: [elements/geometry/BoxGeometry.ts:14](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/geometry/BoxGeometry.ts#L14)

Tamanho.

***

### vertexCount

> **vertexCount**: `number`

Defined in: [elements/geometry/BoxGeometry.ts:10](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/geometry/BoxGeometry.ts#L10)

Número de vértices.

***

### vertices?

> `optional` **vertices?**: `Float32Array`\<`ArrayBufferLike`\>

Defined in: [elements/geometry/Geometry.ts:17](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/geometry/Geometry.ts#L17)

Vértices intercalados (posição, normal, uv).

#### Inherited from

[`GeometryData`](GeometryData.md).[`vertices`](GeometryData.md#vertices)

***

### wireEdges?

> `optional` **wireEdges?**: `Uint32Array`\<`ArrayBufferLike`\>

Defined in: [elements/geometry/Geometry.ts:24](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/geometry/Geometry.ts#L24)

Arestas de arame (spec 008): pares de índices de vértice em espaço de objeto — o que o `WireframeMaterial` desenha
(de feição nas geometrias estáticas: sem as diagonais de faces planas).

#### Inherited from

[`GeometryData`](GeometryData.md).[`wireEdges`](GeometryData.md#wireedges)
