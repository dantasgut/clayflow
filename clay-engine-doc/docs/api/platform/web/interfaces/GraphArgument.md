[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / GraphArgument

# Interface: GraphArgument

Defined in: [src/scene/graph/NodeGraph.ts:12](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L12)

Argumento da função do ponto alvo lido pelo grafo (ex.: a amostra de superfície `s` do ponto `material`). Saídas:
`value` (o argumento inteiro) e um campo por entrada de `fields` (`s.world_position`…).

## Properties

### fields

> `readonly` **fields**: `Readonly`\<`Record`\<`string`, [`PortType`](../type-aliases/PortType.md)\>\>

Defined in: [src/scene/graph/NodeGraph.ts:17](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L17)

Campos do struct do argumento expostos como saídas: nome → tipo.

***

### kind

> `readonly` **kind**: `"argument"`

Defined in: [src/scene/graph/NodeGraph.ts:13](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L13)

***

### name

> `readonly` **name**: `string`

Defined in: [src/scene/graph/NodeGraph.ts:15](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L15)

Nome do argumento na assinatura do ponto (`WgslPointSignature.names`).
