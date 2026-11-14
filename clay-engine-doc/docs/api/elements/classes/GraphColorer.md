[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / GraphColorer

# Class: GraphColorer

Defined in: [src/elements/gpu/compute/GraphColorer.ts:180](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/GraphColorer.ts#L180)

Coloração de arestas na GPU (research R12) para resolver restrições em paralelo: arestas da mesma cor não
compartilham vértice. Cada cor é um emparelhamento maximal construído por subpassos (prioridade única por aresta
via `pcg_hash`, máximo atômico nos vértices), então o número de cores é ≤ 2Δ − 1. Depois a ordenação radix agrupa
as arestas por cor e a soma de prefixos das contagens dá os intervalos.

Assíncrona e com envios próprios: chamada na criação ou mudança de topologia, fora de um quadro (`core.record`),
nunca por quadro — kernels e preparações internas são criados antes de cada envio. Substitui o `GraphColorSolver`
em CPU. Os buffers são descritores do Resource de trabalho (spec 039); o estado e os intervalos voltam à CPU pela
leitura sob demanda da C2 (`read`).

## Implements

- [`WorkPart`](../../platform/web/interfaces/WorkPart.md)

## Constructors

### Constructor

> **new GraphColorer**(`ctx`, `options`): `GraphColorer`

Defined in: [src/elements/gpu/compute/GraphColorer.ts:194](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/GraphColorer.ts#L194)

#### Parameters

##### ctx

[`WorkContext`](../../platform/web/interfaces/WorkContext.md)

##### options

[`GraphColorerOptions`](../interfaces/GraphColorerOptions.md)

#### Returns

`GraphColorer`

## Methods

### color()

> **color**(`edges`, `count`, `vertexCount`): `Promise`\<[`GraphColoring`](../interfaces/GraphColoring.md)\>

Defined in: [src/elements/gpu/compute/GraphColorer.ts:278](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/GraphColorer.ts#L278)

Colore as `count` arestas `edges` (`vec2u[count]`) de um grafo com `vertexCount` vértices. Rejeita laços
(`a == b`) e índices fora de `[0, vertexCount)`; arestas repetidas recebem cores distintas.

#### Parameters

##### edges

[`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md)

##### count

`number`

##### vertexCount

`number`

#### Returns

`Promise`\<[`GraphColoring`](../interfaces/GraphColoring.md)\>

***

### descriptors()

> **descriptors**(): readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

Defined in: [src/elements/gpu/compute/GraphColorer.ts:234](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/GraphColorer.ts#L234)

Parâmetros, estado e buffers por aresta (pela capacidade) e, depois da primeira coloração, os por vértice.

#### Returns

readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

#### Implementation of

[`WorkPart`](../../platform/web/interfaces/WorkPart.md).[`descriptors`](../../platform/web/interfaces/WorkPart.md#descriptors)

***

### destroy()

> **destroy**(): `void`

Defined in: [src/elements/gpu/compute/GraphColorer.ts:305](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/GraphColorer.ts#L305)

Libera os kernels (e os da ordenação, da soma e da redução) e solta os buffers: a C2 os libera.

#### Returns

`void`
