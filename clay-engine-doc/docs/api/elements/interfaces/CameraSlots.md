[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / CameraSlots

# Interface: CameraSlots

Defined in: [elements/scene/flows/CameraFlow.ts:35](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/scene/flows/CameraFlow.ts#L35)

Slots do estágio de câmera.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### cameras

> `readonly` **cameras**: `EntitiesSlot`

Defined in: [elements/scene/flows/CameraFlow.ts:45](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/scene/flows/CameraFlow.ts#L45)

Toda entidade com `Camera` (a falta do `Transform` é erro).

***

### fnRecords

> `readonly` **fnRecords**: `PoolSlot`\<`true`\>

Defined in: [elements/scene/flows/CameraFlow.ts:49](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/scene/flows/CameraFlow.ts#L49)

Pool dos registros de parâmetros das `CameraFunction` (existe com alguma função na cena).

***

### functions

> `readonly` **functions**: `EntitiesSlot`

Defined in: [elements/scene/flows/CameraFlow.ts:47](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/scene/flows/CameraFlow.ts#L47)

Câmeras com `CameraFunction` (spec 009).

***

### matrices

> `readonly` **matrices**: `PoolSlot`\<`false`\>

Defined in: [elements/scene/flows/CameraFlow.ts:39](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/scene/flows/CameraFlow.ts#L39)

Pool das matrizes (`CameraMatrices`, saída).

***

### params

> `readonly` **params**: `PoolSlot`\<`false`\>

Defined in: [elements/scene/flows/CameraFlow.ts:37](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/scene/flows/CameraFlow.ts#L37)

Pool dos parâmetros (`Camera`): o estágio espera a primeira câmera.

***

### time

> `readonly` **time**: `SingletonSlot`\<`true`\>

Defined in: [elements/scene/flows/CameraFlow.ts:51](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/scene/flows/CameraFlow.ts#L51)

Relógio da cena (tempo simulado das funções; sem relógio, 0).

***

### views

> `readonly` **views**: `EntitiesSlot`

Defined in: [elements/scene/flows/CameraFlow.ts:43](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/scene/flows/CameraFlow.ts#L43)

Câmeras com `Transform`: registro `CameraRecord` e a lista das vivas (grupo único).

***

### worlds

> `readonly` **worlds**: `PoolSlot`\<`false`\>

Defined in: [elements/scene/flows/CameraFlow.ts:41](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/scene/flows/CameraFlow.ts#L41)

Pool `WorldTransform` (matriz de mundo da câmera).
