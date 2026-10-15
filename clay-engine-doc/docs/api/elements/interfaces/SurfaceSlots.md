[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SurfaceSlots

# Interface: SurfaceSlots

Defined in: [elements/geometry/SurfaceFlow.ts:71](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/geometry/SurfaceFlow.ts#L71)

Slots do estágio das superfícies paramétricas.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### camera

> `readonly` **camera**: `SingletonSlot`\<`true`\>

Defined in: [elements/geometry/SurfaceFlow.ts:85](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/geometry/SurfaceFlow.ts#L85)

Câmera ativa (malha adaptativa: distância).

***

### cameras

> `readonly` **cameras**: `PoolSlot`\<`true`\>

Defined in: [elements/geometry/SurfaceFlow.ts:87](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/geometry/SurfaceFlow.ts#L87)

Matrizes das câmeras (só GPU).

***

### diffs

> `readonly` **diffs**: `PoolSlot`\<`true`\>

Defined in: [elements/geometry/SurfaceFlow.ts:83](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/geometry/SurfaceFlow.ts#L83)

Pool da geometria diferencial (existe com superfícies `differential`).

***

### fnRecords

> `readonly` **fnRecords**: `PoolSlot`\<`true`\>

Defined in: [elements/geometry/SurfaceFlow.ts:77](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/geometry/SurfaceFlow.ts#L77)

Pool dos registros das `SurfaceFunction` (opcional).

***

### functions

> `readonly` **functions**: `EntitiesSlot`

Defined in: [elements/geometry/SurfaceFlow.ts:75](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/geometry/SurfaceFlow.ts#L75)

Superfícies com `SurfaceFunction`.

***

### spaceRecords

> `readonly` **spaceRecords**: `PoolSlot`\<`true`\>

Defined in: [elements/geometry/SurfaceFlow.ts:79](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/geometry/SurfaceFlow.ts#L79)

Pool dos registros das `SpaceFunction` (existe com espaço na cena: avaliação a cada quadro).

***

### surfaces

> `readonly` **surfaces**: `EntitiesSlot`

Defined in: [elements/geometry/SurfaceFlow.ts:73](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/geometry/SurfaceFlow.ts#L73)

Superfícies paramétricas (o estágio escreve os vértices).

***

### time

> `readonly` **time**: `SingletonSlot`\<`true`\>

Defined in: [elements/geometry/SurfaceFlow.ts:81](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/geometry/SurfaceFlow.ts#L81)

Relógio da cena (opcional; sem ele, tempo 0).

***

### worlds

> `readonly` **worlds**: `PoolSlot`\<`true`\>

Defined in: [elements/geometry/SurfaceFlow.ts:89](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/geometry/SurfaceFlow.ts#L89)

Matrizes de mundo (malha adaptativa: a superfície na cena).
