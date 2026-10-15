[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ParametricSurfaceData

# Interface: ParametricSurfaceData

Defined in: [elements/geometry/ParametricSurface.ts:27](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/geometry/ParametricSurface.ts#L27)

Dado de uma `ParametricSurface`.

## Extends

- [`GeometryData`](GeometryData.md)

## Properties

### animated

> **animated**: `boolean`

Defined in: [elements/geometry/ParametricSurface.ts:32](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/geometry/ParametricSurface.ts#L32)

***

### domain

> **domain**: \[`number`, `number`, `number`, `number`\]

Defined in: [elements/geometry/ParametricSurface.ts:29](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/geometry/ParametricSurface.ts#L29)

***

### indexCount

> **indexCount**: `number`

Defined in: [elements/geometry/ParametricSurface.ts:35](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/geometry/ParametricSurface.ts#L35)

***

### indices

> **indices**: `Uint32Array`

Defined in: [elements/geometry/ParametricSurface.ts:33](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/geometry/ParametricSurface.ts#L33)

Índices de triângulo.

#### Overrides

[`GeometryData`](GeometryData.md).[`indices`](GeometryData.md#indices)

***

### params

> **params**: `number`[]

Defined in: [elements/geometry/ParametricSurface.ts:31](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/geometry/ParametricSurface.ts#L31)

***

### preset

> **preset**: [`SurfacePreset`](../type-aliases/SurfacePreset.md)

Defined in: [elements/geometry/ParametricSurface.ts:30](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/geometry/ParametricSurface.ts#L30)

***

### resolution

> **resolution**: \[`number`, `number`\]

Defined in: [elements/geometry/ParametricSurface.ts:28](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/geometry/ParametricSurface.ts#L28)

***

### vertexCount

> **vertexCount**: `number`

Defined in: [elements/geometry/ParametricSurface.ts:34](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/geometry/ParametricSurface.ts#L34)

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
