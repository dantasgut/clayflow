[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / GraphColorer

# Class: GraphColorer

Defined in: [elements/gpu/compute/GraphColorer.ts:181](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/gpu/compute/GraphColorer.ts#L181)

Coloração de arestas na GPU (research R12) para resolver restrições em paralelo: arestas da mesma cor não
compartilham vértice. Cada cor é um emparelhamento maximal construído por subpassos (prioridade única por aresta
via `pcg_hash`, máximo atômico nos vértices), então o número de cores é ≤ 2Δ − 1. Depois a ordenação radix agrupa
as arestas por cor e a soma de prefixos das contagens dá os intervalos.

Assíncrona e com envios próprios: chamada na criação ou mudança de topologia, fora de um quadro (`core.record`),
nunca por quadro — kernels e preparações internas são criados antes de cada envio. Substitui o `GraphColorSolver`
em CPU.

## Constructors

### Constructor

> **new GraphColorer**(`core`, `options`): `GraphColorer`

Defined in: [elements/gpu/compute/GraphColorer.ts:192](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/gpu/compute/GraphColorer.ts#L192)

#### Parameters

##### core

`EngineCore`

##### options

[`GraphColorerOptions`](../interfaces/GraphColorerOptions.md)

#### Returns

`GraphColorer`

## Methods

### color()

> **color**(`edges`, `count`, `vertexCount`): `Promise`\<[`GraphColoring`](../interfaces/GraphColoring.md)\>

Defined in: [elements/gpu/compute/GraphColorer.ts:228](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/gpu/compute/GraphColorer.ts#L228)

Colore as `count` arestas `edges` (`vec2u[count]`) de um grafo com `vertexCount` vértices. Rejeita laços
(`a == b`) e índices fora de `[0, vertexCount)`; arestas repetidas recebem cores distintas.

#### Parameters

##### edges

`StorageBufferSpec`

##### count

`number`

##### vertexCount

`number`

#### Returns

`Promise`\<[`GraphColoring`](../interfaces/GraphColoring.md)\>

***

### destroy()

> **destroy**(): `void`

Defined in: [elements/gpu/compute/GraphColorer.ts:255](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/gpu/compute/GraphColorer.ts#L255)

Libera kernels, buffers, ordenação e soma de prefixos internas.

#### Returns

`void`
