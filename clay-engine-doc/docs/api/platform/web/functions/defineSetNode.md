[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / defineSetNode

# Function: defineSetNode()

> **defineSetNode**(`options`): [`SetNodeDefinition`](../interfaces/SetNodeDefinition.md)

Defined in: [src/scene/graph/SetNode.ts:163](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L163)

Define um nó de conjunto (spec 031, R10): portas de conjunto e de ponto, parâmetros, a regra de capacidade e de
contagem de cada conjunto de saída e a fábrica da instância. Confere na criação os nomes e que toda regra nomeia um
conjunto de saída (`same`: um conjunto de entrada do mesmo schema).

## Parameters

### options

[`SetNodeDefinitionOptions`](../interfaces/SetNodeDefinitionOptions.md)

## Returns

[`SetNodeDefinition`](../interfaces/SetNodeDefinition.md)

## Throws

NodeGraphError (`node-signature`) nomeando o nó e o problema.
