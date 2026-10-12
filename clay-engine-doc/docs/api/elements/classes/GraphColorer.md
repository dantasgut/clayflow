[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / GraphColorer

# Class: GraphColorer

Defined in: [elements/gpu/compute/GraphColorer.ts:183](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/GraphColorer.ts#L183)

Coloração de arestas na GPU (research R12) para resolver restrições em paralelo: arestas da mesma cor não
compartilham vértice. Cada cor é um emparelhamento maximal construído por subpassos (prioridade única por aresta
via `pcg_hash`, máximo atômico nos vértices), então o número de cores é ≤ 2Δ − 1. Depois a ordenação radix agrupa
as arestas por cor e a soma de prefixos das contagens dá os intervalos.

Assíncrona e com envios próprios: chamada na criação ou mudança de topologia, fora de um quadro (`core.record`),
nunca por quadro. Substitui o `GraphColorSolver` em CPU.

## Constructors

### Constructor

> **new GraphColorer**(`core`, `options`): `GraphColorer`

Defined in: [elements/gpu/compute/GraphColorer.ts:194](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/GraphColorer.ts#L194)

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

Defined in: [elements/gpu/compute/GraphColorer.ts:230](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/GraphColorer.ts#L230)

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

Defined in: [elements/gpu/compute/GraphColorer.ts:257](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/GraphColorer.ts#L257)

Libera kernels, buffers, ordenação e soma de prefixos internas.

#### Returns

`void`
