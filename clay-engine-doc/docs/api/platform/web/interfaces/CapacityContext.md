[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / CapacityContext

# Interface: CapacityContext

Defined in: [src/scene/graph/SetNode.ts:105](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L105)

O que a regra de capacidade de um nó lê: valores dos parâmetros e capacidades das entradas.

## Properties

### values

> `readonly` **values**: `Readonly`\<`Record`\<`string`, [`ExtensionParamValue`](../type-aliases/ExtensionParamValue.md)\>\>

Defined in: [src/scene/graph/SetNode.ts:106](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L106)

## Methods

### input()

> **input**(`port`, `set`): `number`

Defined in: [src/scene/graph/SetNode.ts:108](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L108)

Capacidade do conjunto `set` ligado à entrada `port`.

#### Parameters

##### port

`string`

##### set

`string`

#### Returns

`number`
