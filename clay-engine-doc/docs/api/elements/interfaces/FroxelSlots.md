[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / FroxelSlots

# Interface: FroxelSlots

Defined in: [src/elements/media/FroxelFlow.ts:40](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/FroxelFlow.ts#L40)

Slots do estágio dos froxels.

## Extends

- [`SlotMap`](../../platform/web/type-aliases/SlotMap.md)

## Indexable

> \[`key`: `string`\]: [`SlotDeclaration`](../../platform/web/type-aliases/SlotDeclaration.md)

## Properties

### camera

> `readonly` **camera**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/media/FroxelFlow.ts:46](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/FroxelFlow.ts#L46)

A câmera ativa (a grade é dela).

***

### cameras

> `readonly` **cameras**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`true`\>

Defined in: [src/elements/media/FroxelFlow.ts:48](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/FroxelFlow.ts#L48)

As matrizes das câmeras (o slot da ativa).

***

### fogs

> `readonly` **fogs**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/media/FroxelFlow.ts:44](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/FroxelFlow.ts#L44)

Os volumes de névoa.

***

### froxelHistory

> `readonly` **froxelHistory**: `ChannelSlot`\<`false`\>

Defined in: [src/elements/media/FroxelFlow.ts:52](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/FroxelFlow.ts#L52)

O histórico dos froxels: um canal temporal (spec 037), alocado com a primeira névoa.

***

### froxels

> `readonly` **froxels**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`false`\>

Defined in: [src/elements/media/FroxelFlow.ts:42](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/FroxelFlow.ts#L42)

Os froxels da cena (inseridos pelos estágios padrão).

***

### time

> `readonly` **time**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/media/FroxelFlow.ts:50](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/FroxelFlow.ts#L50)

O tempo simulado (as funções de densidade).
