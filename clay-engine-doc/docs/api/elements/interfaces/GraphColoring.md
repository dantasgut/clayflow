[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / GraphColoring

# Interface: GraphColoring

Defined in: [src/elements/gpu/compute/GraphColorer.ts:40](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/GraphColorer.ts#L40)

Resultado de uma coloração de arestas. Os buffers pertencem ao `GraphColorer` e valem até a próxima coloração.

## Properties

### colorCount

> `readonly` **colorCount**: `number`

Defined in: [src/elements/gpu/compute/GraphColorer.ts:42](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/GraphColorer.ts#L42)

Cores usadas (`0..colorCount-1`).

***

### edgeColors

> `readonly` **edgeColors**: [`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md)

Defined in: [src/elements/gpu/compute/GraphColorer.ts:44](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/GraphColorer.ts#L44)

`u32[edgeCount]`: cor de cada aresta.

***

### edgesByColor

> `readonly` **edgesByColor**: [`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md)

Defined in: [src/elements/gpu/compute/GraphColorer.ts:46](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/GraphColorer.ts#L46)

`u32[edgeCount]`: índices de aresta agrupados por cor (estável por índice dentro da cor).

***

### ranges

> `readonly` **ranges**: [`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md)

Defined in: [src/elements/gpu/compute/GraphColorer.ts:48](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/GraphColorer.ts#L48)

`ColorRange[colorCount]`: `{ offset, count }` de cada cor em `edgesByColor`.

***

### rangesCpu

> `readonly` **rangesCpu**: readonly [`ColorRangeCpu`](ColorRangeCpu.md)[]

Defined in: [src/elements/gpu/compute/GraphColorer.ts:50](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/GraphColorer.ts#L50)

Os mesmos intervalos, lidos para a CPU (para gravar um despacho por cor).
