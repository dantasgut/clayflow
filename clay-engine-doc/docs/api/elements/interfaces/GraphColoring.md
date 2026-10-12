[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / GraphColoring

# Interface: GraphColoring

Defined in: [elements/gpu/compute/GraphColorer.ts:43](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/gpu/compute/GraphColorer.ts#L43)

Resultado de uma coloração de arestas. Os buffers pertencem ao `GraphColorer` e valem até a próxima coloração.

## Properties

### colorCount

> `readonly` **colorCount**: `number`

Defined in: [elements/gpu/compute/GraphColorer.ts:45](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/gpu/compute/GraphColorer.ts#L45)

Cores usadas (`0..colorCount-1`).

***

### edgeColors

> `readonly` **edgeColors**: `StorageBufferSpec`

Defined in: [elements/gpu/compute/GraphColorer.ts:47](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/gpu/compute/GraphColorer.ts#L47)

`u32[edgeCount]`: cor de cada aresta.

***

### edgesByColor

> `readonly` **edgesByColor**: `StorageBufferSpec`

Defined in: [elements/gpu/compute/GraphColorer.ts:49](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/gpu/compute/GraphColorer.ts#L49)

`u32[edgeCount]`: índices de aresta agrupados por cor (estável por índice dentro da cor).

***

### ranges

> `readonly` **ranges**: `StorageBufferSpec`

Defined in: [elements/gpu/compute/GraphColorer.ts:51](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/gpu/compute/GraphColorer.ts#L51)

`ColorRange[colorCount]`: `{ offset, count }` de cada cor em `edgesByColor`.

***

### rangesCpu

> `readonly` **rangesCpu**: readonly [`ColorRangeCpu`](ColorRangeCpu.md)[]

Defined in: [elements/gpu/compute/GraphColorer.ts:53](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/gpu/compute/GraphColorer.ts#L53)

Os mesmos intervalos, lidos para a CPU (para gravar um despacho por cor).
