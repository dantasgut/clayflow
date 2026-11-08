[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / SetCountSchema

# Variable: SetCountSchema

> `const` **SetCountSchema**: [`StructSchema`](../classes/StructSchema.md)

Defined in: [src/scene/graph/SetCountSchema.ts:10](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetCountSchema.ts#L10)

Contagem de um conjunto de um grafo de nós (spec 031, R10), escrita só pela GPU: o número de elementos e, derivados
dele no próprio fluxo (`CountToArgs`), os argumentos de despacho (byte 4: `x, y, z`) e de desenho (byte 16: indexado
`indexCount, instanceCount, firstIndex, baseVertex, firstInstance`; os quatro primeiros servem ao desenho não
indexado). Vários registros num descritor `indirect`, lidos como `array<SetCount>` pelo índice do conjunto.
