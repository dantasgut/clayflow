[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ParametricSurfaceData

# Interface: ParametricSurfaceData

Defined in: [elements/geometry/ParametricSurface.ts:82](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L82)

Dado de uma `ParametricSurface`.

## Extends

- [`GeometryData`](GeometryData.md)

## Properties

### animated

> **animated**: `boolean`

Defined in: [elements/geometry/ParametricSurface.ts:92](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L92)

Reavalia a cada quadro.

***

### domain

> **domain**: \[`number`, `number`, `number`, `number`\]

Defined in: [elements/geometry/ParametricSurface.ts:86](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L86)

Domínio [u0, u1, v0, v1].

***

### indexCount

> **indexCount**: `number`

Defined in: [elements/geometry/ParametricSurface.ts:98](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L98)

Índices (na adaptativa, a capacidade).

***

### indices?

> `optional` **indices?**: `Uint32Array`\<`ArrayBufferLike`\>

Defined in: [elements/geometry/ParametricSurface.ts:94](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L94)

Índices fixos da grade uniforme (ausentes na adaptativa: escritos pela GPU).

#### Overrides

[`GeometryData`](GeometryData.md).[`indices`](GeometryData.md#indices)

***

### params

> **params**: `number`[]

Defined in: [elements/geometry/ParametricSurface.ts:90](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L90)

Valores da pronta.

***

### preset

> **preset**: [`SurfacePreset`](../type-aliases/SurfacePreset.md)

Defined in: [elements/geometry/ParametricSurface.ts:88](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L88)

Superfície pronta (sem `SurfaceFunction`).

***

### resolution

> **resolution**: \[`number`, `number`\]

Defined in: [elements/geometry/ParametricSurface.ts:84](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L84)

Vértices em u e em v (na adaptativa, os da grade uniforme de mesma precisão máxima).

***

### vertexCount

> **vertexCount**: `number`

Defined in: [elements/geometry/ParametricSurface.ts:96](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L96)

Vértices (na adaptativa, a capacidade).

***

### vertices?

> `optional` **vertices?**: `Float32Array`\<`ArrayBufferLike`\>

Defined in: [elements/geometry/Geometry.ts:17](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/Geometry.ts#L17)

Vértices intercalados (posição, normal, uv).

#### Inherited from

[`GeometryData`](GeometryData.md).[`vertices`](GeometryData.md#vertices)

***

### wireEdges?

> `optional` **wireEdges?**: `Uint32Array`\<`ArrayBufferLike`\>

Defined in: [elements/geometry/Geometry.ts:24](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/Geometry.ts#L24)

Arestas de arame (spec 008): pares de índices de vértice em espaço de objeto — o que o `WireframeMaterial` desenha
(de feição nas geometrias estáticas: sem as diagonais de faces planas).

#### Inherited from

[`GeometryData`](GeometryData.md).[`wireEdges`](GeometryData.md#wireedges)
