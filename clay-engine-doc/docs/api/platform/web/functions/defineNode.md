[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / defineNode

# Function: defineNode()

> **defineNode**(`options`): [`NodeDefinition`](../interfaces/NodeDefinition.md)

Defined in: [src/scene/graph/NodeDefinition.ts:103](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeDefinition.ts#L103)

Define um nó de ponto (spec 031, FR-013): confere na criação que a função existe no módulo com a assinatura das
portas e dos parâmetros (entradas, depois parâmetros; retorno = a saída, ou um struct com os campos das saídas).

## Parameters

### options

[`NodeDefinitionOptions`](../interfaces/NodeDefinitionOptions.md)

## Returns

[`NodeDefinition`](../interfaces/NodeDefinition.md)

## Throws

NodeGraphError (`node-signature`) nomeando o nó, a porta e o esperado.
