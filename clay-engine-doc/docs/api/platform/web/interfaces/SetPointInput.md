[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / SetPointInput

# Interface: SetPointInput

Defined in: [src/scene/graph/SetNode.ts:41](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L41)

Entrada de ponto de um nó de conjunto (spec 031, FR-018): o grafo de ponto ligado a ela é compilado contra `target`
(assinatura com os argumentos por elemento e os parâmetros) e fundido no kernel do nó, que chama a função `at` —
a mesma assinatura sem os parâmetros. Sem ligação, o kernel usa o pronto de `at` (o valor padrão da entrada).

## Properties

### at

> `readonly` **at**: [`BindablePoint`](BindablePoint.md)

Defined in: [src/scene/graph/SetNode.ts:45](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L45)

Ponto vinculável que o kernel chama (o pronto devolve o padrão); trocado pelo grafo compilado.

***

### fn

> `readonly` **fn**: `string`

Defined in: [src/scene/graph/SetNode.ts:47](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L47)

Nome da função de `at`.

***

### kind

> `readonly` **kind**: `"point"`

Defined in: [src/scene/graph/SetNode.ts:42](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L42)

***

### target

> `readonly` **target**: [`PointTarget`](../type-aliases/PointTarget.md)

Defined in: [src/scene/graph/SetNode.ts:43](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L43)
