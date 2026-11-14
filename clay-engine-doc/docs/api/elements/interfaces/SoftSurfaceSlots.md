[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / SoftSurfaceSlots

# Interface: SoftSurfaceSlots

Defined in: [src/elements/physics/flows/SoftSurfaceFlow.ts:30](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SoftSurfaceFlow.ts#L30)

Slots do estágio de superfície de corpos moles.

## Extends

- [`SlotMap`](../../platform/web/type-aliases/SlotMap.md)

## Indexable

> \[`key`: `string`\]: [`SlotDeclaration`](../../platform/web/type-aliases/SlotDeclaration.md)

## Properties

### surfaces

> `readonly` **surfaces**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/physics/flows/SoftSurfaceFlow.ts:32](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SoftSurfaceFlow.ts#L32)

Corpos moles com superfície; o estágio é o escritor dos vértices dela.

***

### work

> `readonly` **work**: [`WorkSlot`](../../platform/web/interfaces/WorkSlot.md)\<`SoftSurfaceWork`\>

Defined in: [src/elements/physics/flows/SoftSurfaceFlow.ts:34](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SoftSurfaceFlow.ts#L34)

O espaço de trabalho: as normais de face de cada corpo e as regiões de parâmetros (spec 039).
