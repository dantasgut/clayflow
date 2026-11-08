[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / toJSON

# Function: toJSON()

> **toJSON**(`graph`, `registry`): [`GraphJSON`](../interfaces/GraphJSON.md)

Defined in: [src/scene/graph/serialize.ts:87](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/serialize.ts#L87)

Grafo → JSON (spec 031, R11): nós registrados pelo nome do tipo e os valores do uso; argumentos com os campos; nós
WGSL do usuário (fora do registro, sem dependências) com o código; sub-grafos pela estrutura (o grafo e as opções,
uma vez por nome). Ida e volta (`fromJSON`) dá a mesma forma e o mesmo código.

## Parameters

### graph

[`NodeGraph`](../classes/NodeGraph.md)

### registry

[`NodeRegistry`](../classes/NodeRegistry.md)

## Returns

[`GraphJSON`](../interfaces/GraphJSON.md)

## Throws

NodeGraphError (`serialization`) nó fora do registro que não se serializa (de conjunto, ou WGSL com
  dependências), ou dois sub-grafos diferentes com o mesmo nome.
