[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / SetNodeInstance

# Interface: SetNodeInstance

Defined in: [src/scene/graph/SetNode.ts:95](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L95)

Instância de um nó de conjunto num grafo: grava os passes; reage a valores novos.

## Methods

### dispose()

> **dispose**(): `void`

Defined in: [src/scene/graph/SetNode.ts:101](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L101)

Libera kernels e buffers próprios.

#### Returns

`void`

***

### record()

> **record**(`frame`): `void`

Defined in: [src/scene/graph/SetNode.ts:99](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L99)

Grava os passes do nó (o grafo está desatualizado).

#### Parameters

##### frame

[`Frame`](Frame.md)

#### Returns

`void`

***

### update()

> **update**(): `void`

Defined in: [src/scene/graph/SetNode.ts:97](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L97)

Valores dos parâmetros mudaram (escrever uniforms).

#### Returns

`void`
