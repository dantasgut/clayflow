[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / AdaptiveConfig

# Interface: AdaptiveConfig

Defined in: [elements/geometry/ParametricSurface.ts:56](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L56)

Malha adaptativa resolvida (valores efetivos).

## Properties

### budget

> `readonly` **budget**: `number`

Defined in: [elements/geometry/ParametricSurface.ts:62](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L62)

Teto de triângulos.

***

### edgeIndexCapacity

> `readonly` **edgeIndexCapacity**: `number`

Defined in: [elements/geometry/ParametricSurface.ts:78](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L78)

Índices de arestas do arame com todos os retalhos no nível máximo (capacidade).

***

### indexCapacity

> `readonly` **indexCapacity**: `number`

Defined in: [elements/geometry/ParametricSurface.ts:76](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L76)

Índices com todos os retalhos no nível máximo (capacidade).

***

### maxLevel

> `readonly` **maxLevel**: `number`

Defined in: [elements/geometry/ParametricSurface.ts:60](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L60)

Nível máximo.

***

### patches

> `readonly` **patches**: readonly \[`number`, `number`\]

Defined in: [elements/geometry/ParametricSurface.ts:58](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L58)

Retalhos em u e v.

***

### periodic

> `readonly` **periodic**: readonly \[`boolean`, `boolean`\]

Defined in: [elements/geometry/ParametricSurface.ts:68](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L68)

Domínio periódico em u e v.

***

### refreshDistance

> `readonly` **refreshDistance**: `number`

Defined in: [elements/geometry/ParametricSurface.ts:70](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L70)

Deslocamento da câmera que refaz a malha (m).

***

### screen

> `readonly` **screen**: `number`

Defined in: [elements/geometry/ParametricSurface.ts:66](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L66)

Fração da altura da imagem por segmento.

***

### side

> `readonly` **side**: `number`

Defined in: [elements/geometry/ParametricSurface.ts:72](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L72)

Vértices por lado de um retalho no nível máximo (2^L + 1).

***

### tolerance

> `readonly` **tolerance**: `number`

Defined in: [elements/geometry/ParametricSurface.ts:64](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L64)

Erro de corda tolerado (m).

***

### vertexCapacity

> `readonly` **vertexCapacity**: `number`

Defined in: [elements/geometry/ParametricSurface.ts:74](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L74)

Vértices com todos os retalhos no nível máximo (capacidade).
