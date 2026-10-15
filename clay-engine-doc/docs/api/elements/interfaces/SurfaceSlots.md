[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SurfaceSlots

# Interface: SurfaceSlots

Defined in: [elements/geometry/SurfaceFlow.ts:31](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/geometry/SurfaceFlow.ts#L31)

Slots do estágio das superfícies paramétricas.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### fnRecords

> `readonly` **fnRecords**: `PoolSlot`\<`true`\>

Defined in: [elements/geometry/SurfaceFlow.ts:37](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/geometry/SurfaceFlow.ts#L37)

Pool dos registros das `SurfaceFunction` (opcional).

***

### functions

> `readonly` **functions**: `EntitiesSlot`

Defined in: [elements/geometry/SurfaceFlow.ts:35](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/geometry/SurfaceFlow.ts#L35)

Superfícies com `SurfaceFunction`.

***

### spaceRecords

> `readonly` **spaceRecords**: `PoolSlot`\<`true`\>

Defined in: [elements/geometry/SurfaceFlow.ts:39](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/geometry/SurfaceFlow.ts#L39)

Pool dos registros das `SpaceFunction` (existe com espaço na cena: avaliação a cada quadro).

***

### surfaces

> `readonly` **surfaces**: `EntitiesSlot`

Defined in: [elements/geometry/SurfaceFlow.ts:33](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/geometry/SurfaceFlow.ts#L33)

Superfícies paramétricas (o estágio escreve os vértices).

***

### time

> `readonly` **time**: `SingletonSlot`\<`true`\>

Defined in: [elements/geometry/SurfaceFlow.ts:41](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/geometry/SurfaceFlow.ts#L41)

Relógio da cena (opcional; sem ele, tempo 0).
