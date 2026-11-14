[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / NodeGraphOptions

# Interface: NodeGraphOptions

Defined in: [src/scene/graph/NodeGraph.ts:66](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L66)

Opções de `NodeGraph`.

## Properties

### links

> `readonly` **links**: readonly [`GraphLink`](../type-aliases/GraphLink.md)[]

Defined in: [src/scene/graph/NodeGraph.ts:70](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L70)

Ligações saída → entrada. Uma entrada recebe no máximo uma; uma saída alimenta quantas quiser.

***

### nodes

> `readonly` **nodes**: `Readonly`\<`Record`\<`string`, [`GraphNode`](../type-aliases/GraphNode.md)\>\>

Defined in: [src/scene/graph/NodeGraph.ts:68](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L68)

Nós por id (identificador WGSL).

***

### open?

> `readonly` `optional` **open?**: readonly `string`[]

Defined in: [src/scene/graph/NodeGraph.ts:79](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L79)

Entradas de conjunto deixadas abertas (`nó.porta`): a fronteira de um sub-grafo de conjunto, ligada por quem o usa.

***

### output?

> `readonly` `optional` **output?**: `string`

Defined in: [src/scene/graph/NodeGraph.ts:75](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L75)

A porta cujo valor a função do grafo devolve (`'nó.porta'`). Sem saída (grafo vazio ou em montagem), a função
usa a implementação pronta do ponto.
