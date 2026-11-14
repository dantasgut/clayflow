[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / SetSubgraphOptions

# Interface: SetSubgraphOptions

Defined in: [src/scene/graph/Subgraph.ts:23](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/Subgraph.ts#L23)

Opções de um sub-grafo de conjunto.

## Properties

### expose?

> `readonly` `optional` **expose?**: readonly `string`[]

Defined in: [src/scene/graph/Subgraph.ts:30](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/Subgraph.ts#L30)

Parâmetros expostos (`nó.parâmetro`), com valor por uso.

***

### inputs?

> `readonly` `optional` **inputs?**: `Readonly`\<`Record`\<`string`, `string`\>\>

Defined in: [src/scene/graph/Subgraph.ts:26](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/Subgraph.ts#L26)

Entradas do nó → a entrada de dentro que alimentam (`nó.porta`).

***

### name

> `readonly` **name**: `string`

Defined in: [src/scene/graph/Subgraph.ts:24](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/Subgraph.ts#L24)

***

### outputs?

> `readonly` `optional` **outputs?**: `Readonly`\<`Record`\<`string`, `string`\>\>

Defined in: [src/scene/graph/Subgraph.ts:28](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/Subgraph.ts#L28)

Saídas do nó → a saída de dentro (`nó.porta`).
