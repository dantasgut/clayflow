[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / CameraSlots

# Interface: CameraSlots

Defined in: [src/elements/scene/flows/CameraFlow.ts:40](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/CameraFlow.ts#L40)

Slots do estágio de câmera.

## Extends

- [`SlotMap`](../../platform/web/type-aliases/SlotMap.md)

## Indexable

> \[`key`: `string`\]: [`SlotDeclaration`](../../platform/web/type-aliases/SlotDeclaration.md)

## Properties

### antialiasing

> `readonly` **antialiasing**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/scene/flows/CameraFlow.ts:56](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/CameraFlow.ts#L56)

Antisserrilhado da cena (spec 034): sem ele, ou fora do modo temporal/acumulação, nenhum deslocamento.

***

### cameras

> `readonly` **cameras**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/scene/flows/CameraFlow.ts:50](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/CameraFlow.ts#L50)

Toda entidade com `Camera` (a falta do `Transform` é erro).

***

### functions

> `readonly` **functions**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/scene/flows/CameraFlow.ts:52](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/CameraFlow.ts#L52)

Câmeras com `CameraFunction` (spec 009; registros nos pools das formas, spec 031).

***

### matrices

> `readonly` **matrices**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`false`\>

Defined in: [src/elements/scene/flows/CameraFlow.ts:44](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/CameraFlow.ts#L44)

Pool das matrizes (`CameraMatrices`, saída).

***

### params

> `readonly` **params**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`false`\>

Defined in: [src/elements/scene/flows/CameraFlow.ts:42](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/CameraFlow.ts#L42)

Pool dos parâmetros (`Camera`): o estágio espera a primeira câmera.

***

### time

> `readonly` **time**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/scene/flows/CameraFlow.ts:54](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/CameraFlow.ts#L54)

Relógio da cena (tempo simulado das funções; sem relógio, 0).

***

### views

> `readonly` **views**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/scene/flows/CameraFlow.ts:48](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/CameraFlow.ts#L48)

Câmeras com `Transform`: registro `CameraRecord` e a lista das vivas (grupo único).

***

### work

> `readonly` **work**: [`WorkSlot`](../../platform/web/interfaces/WorkSlot.md)\<`CameraWork`\>

Defined in: [src/elements/scene/flows/CameraFlow.ts:58](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/CameraFlow.ts#L58)

O espaço de trabalho do estágio: parâmetros, a lista das funções e as regiões por grupo (spec 039).

***

### worlds

> `readonly` **worlds**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`false`\>

Defined in: [src/elements/scene/flows/CameraFlow.ts:46](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/CameraFlow.ts#L46)

Pool `WorldTransform` (matriz de mundo da câmera).
