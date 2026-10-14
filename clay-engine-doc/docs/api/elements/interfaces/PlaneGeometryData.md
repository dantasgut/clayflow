[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / PlaneGeometryData

# Interface: PlaneGeometryData

Defined in: [elements/geometry/PlaneGeometry.ts:8](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/geometry/PlaneGeometry.ts#L8)

Dado de uma `PlaneGeometry`.

## Extends

- [`GeometryData`](GeometryData.md)

## Properties

### indexCount

> **indexCount**: `number`

Defined in: [elements/geometry/PlaneGeometry.ts:12](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/geometry/PlaneGeometry.ts#L12)

Número de índices.

***

### indices?

> `optional` **indices?**: `Uint16Array`\<`ArrayBufferLike`\> \| `Uint32Array`\<`ArrayBufferLike`\>

Defined in: [elements/geometry/Geometry.ts:19](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/geometry/Geometry.ts#L19)

Índices de triângulo.

#### Inherited from

[`GeometryData`](GeometryData.md).[`indices`](GeometryData.md#indices)

***

### size

> **size**: readonly `number`[]

Defined in: [elements/geometry/PlaneGeometry.ts:14](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/geometry/PlaneGeometry.ts#L14)

Tamanho.

***

### vertexCount

> **vertexCount**: `number`

Defined in: [elements/geometry/PlaneGeometry.ts:10](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/geometry/PlaneGeometry.ts#L10)

Número de vértices.

***

### vertices?

> `optional` **vertices?**: `Float32Array`\<`ArrayBufferLike`\>

Defined in: [elements/geometry/Geometry.ts:17](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/geometry/Geometry.ts#L17)

Vértices intercalados (posição, normal, uv).

#### Inherited from

[`GeometryData`](GeometryData.md).[`vertices`](GeometryData.md#vertices)

***

### wireEdges?

> `optional` **wireEdges?**: `Uint32Array`\<`ArrayBufferLike`\>

Defined in: [elements/geometry/Geometry.ts:24](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/geometry/Geometry.ts#L24)

Arestas de arame (spec 008): pares de índices de vértice em espaço de objeto — o que o `WireframeMaterial` desenha
(de feição nas geometrias estáticas: sem as diagonais de faces planas).

#### Inherited from

[`GeometryData`](GeometryData.md).[`wireEdges`](GeometryData.md#wireedges)
