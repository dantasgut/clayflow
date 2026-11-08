[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / PointSubgraphOptions

# Interface: PointSubgraphOptions

Defined in: [src/scene/graph/Subgraph.ts:10](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/Subgraph.ts#L10)

Opções de um sub-grafo de ponto.

## Properties

### expose?

> `readonly` `optional` **expose?**: readonly (`string` \| readonly \[`string`, `string`\])[]

Defined in: [src/scene/graph/Subgraph.ts:19](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/Subgraph.ts#L19)

Parâmetros expostos (`nó.parâmetro`, nome `nó_parâmetro`; ou `['nó.parâmetro', 'nome']`, com nome próprio — spec
011: o OpenPBR expõe `base_color`): viram parâmetros do nó, com valor por uso. Os outros ficam no código.

***

### inputs?

> `readonly` `optional` **inputs?**: `Readonly`\<`Record`\<`string`, `string`\>\>

Defined in: [src/scene/graph/Subgraph.ts:14](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/Subgraph.ts#L14)

Entradas: argumento do grafo (`graphArgument`) → tipo, na ordem das portas.

***

### name

> `readonly` **name**: `string`

Defined in: [src/scene/graph/Subgraph.ts:12](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/Subgraph.ts#L12)

Nome do nó (registro, mensagens).
