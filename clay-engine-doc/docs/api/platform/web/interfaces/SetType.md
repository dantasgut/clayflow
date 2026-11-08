[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / SetType

# Interface: SetType

Defined in: [src/scene/graph/SetNode.ts:23](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L23)

Tipo de uma porta de conjunto (spec 031, R10): um nome (a identidade nas ligações — `mesh` só liga em `mesh`) e os
conjuntos que a porta carrega, cada um com o schema do elemento (ex.: malha = vértices `MeshVertex` + triângulos).

## Properties

### name

> `readonly` **name**: `string`

Defined in: [src/scene/graph/SetNode.ts:24](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L24)

***

### sets

> `readonly` **sets**: `Readonly`\<`Record`\<`string`, [`StructSchema`](../classes/StructSchema.md)\>\>

Defined in: [src/scene/graph/SetNode.ts:25](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L25)
