[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / Subgraph

# Variable: Subgraph

> `const` **Subgraph**: `object`

Defined in: [src/scene/graph/Subgraph.ts:103](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/Subgraph.ts#L103)

Sub-grafos (spec 031, US4): um grafo usado como nó de outro grafo.

## Type Declaration

### point()

> **point**(`graph`, `options`): [`NodeDefinition`](../interfaces/NodeDefinition.md)

Sub-grafo de ponto: um nó cuja função é o grafo compilado (`sub_<hash>`, emitida uma vez por shader — usos
repetidos compartilham o módulo). Entradas: os argumentos do grafo; saída: a do grafo; parâmetros: os expostos.
Os estágios do nó: os comuns a todos os nós de dentro.

#### Parameters

##### graph

[`NodeGraph`](../classes/NodeGraph.md)

##### options

[`PointSubgraphOptions`](../interfaces/PointSubgraphOptions.md)

#### Returns

[`NodeDefinition`](../interfaces/NodeDefinition.md)

#### Throws

NodeGraphError grafo sem saída, entrada que o grafo não usa, parâmetro exposto inexistente, sem estágio
  comum.

### set()

> **set**(`graph`, `options`): [`SetSubgraph`](../interfaces/SetSubgraph.md)

Sub-grafo de conjunto: expandido no grafo que o usa (ver `SetSubgraph`).

#### Parameters

##### graph

[`NodeGraph`](../classes/NodeGraph.md)

##### options

[`SetSubgraphOptions`](../interfaces/SetSubgraphOptions.md)

#### Returns

[`SetSubgraph`](../interfaces/SetSubgraph.md)

#### Throws

NodeGraphError entrada ou saída que não é porta de nó de conjunto de dentro, parâmetro exposto inexistente.
