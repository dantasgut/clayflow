[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / fromJSON

# Function: fromJSON()

> **fromJSON**(`json`, `registry`): [`NodeGraph`](../classes/NodeGraph.md)

Defined in: [src/scene/graph/serialize.ts:188](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/serialize.ts#L188)

JSON → grafo (spec 031, R11): resolve os tipos pelo `registry`, reconstrói os nós WGSL do usuário pelo código e os
sub-grafos pela estrutura. Validado como qualquer grafo.

## Parameters

### json

[`GraphJSON`](../interfaces/GraphJSON.md)

### registry

[`NodeRegistry`](../classes/NodeRegistry.md)

## Returns

[`NodeGraph`](../classes/NodeGraph.md)

## Throws

NodeGraphError (`serialization`) versão desconhecida, tipo fora do registro (nomeando o tipo e o nó),
  sub-grafo não declarado.
