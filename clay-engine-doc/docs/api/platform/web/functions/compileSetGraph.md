[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / compileSetGraph

# Function: compileSetGraph()

> **compileSetGraph**(`graph`, `valuesOf`): [`SetGraphPlan`](../interfaces/SetGraphPlan.md)

Defined in: [src/scene/graph/compileSetGraph.ts:135](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/compileSetGraph.ts#L135)

Plano de um grafo de conjunto (spec 031, R10): nós em ordem topológica; para cada saída, a capacidade pela regra do
nó (valores atuais e capacidades das entradas) e o registro `SetCount` — próprio, ou o da entrada que a regra `same`
nomeia; as contagens da CPU; e os grafos de ponto das entradas de ponto, compilados e fundidos.

## Parameters

### graph

[`NodeGraph`](../classes/NodeGraph.md)

### valuesOf

(`id`) => `Readonly`\<`Record`\<`string`, [`ExtensionParamValue`](../type-aliases/ExtensionParamValue.md)\>\>

Valores atuais do nó (pelo nome do parâmetro).

## Returns

[`SetGraphPlan`](../interfaces/SetGraphPlan.md)

## Throws

NodeGraphError capacidade inválida ou ausente, grafo de ponto que não compila contra o alvo da entrada.
