[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / SurfaceColliderSlots

# Interface: SurfaceColliderSlots

Defined in: [src/elements/physics/flows/SurfaceColliderFlow.ts:58](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SurfaceColliderFlow.ts#L58)

Slots do estágio dos colliders de superfície.

## Extends

- [`SlotMap`](../../platform/web/type-aliases/SlotMap.md)

## Indexable

> \[`key`: `string`\]: [`SlotDeclaration`](../../platform/web/type-aliases/SlotDeclaration.md)

## Properties

### colliders

> `readonly` **colliders**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/physics/flows/SurfaceColliderFlow.ts:60](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SurfaceColliderFlow.ts#L60)

Superfícies colidíveis.

***

### fields

> `readonly` **fields**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`false`\>

Defined in: [src/elements/physics/flows/SurfaceColliderFlow.ts:64](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SurfaceColliderFlow.ts#L64)

Pool do campo (cabeçalho e valores de todos os colliders de superfície).

***

### functions

> `readonly` **functions**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/physics/flows/SurfaceColliderFlow.ts:62](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SurfaceColliderFlow.ts#L62)

Superfícies colidíveis com `SurfaceFunction`.

***

### spaces

> `readonly` **spaces**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/physics/flows/SurfaceColliderFlow.ts:66](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SurfaceColliderFlow.ts#L66)

Funções `space` da cena (com alguma, a superfície anima).

***

### time

> `readonly` **time**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/physics/flows/SurfaceColliderFlow.ts:70](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SurfaceColliderFlow.ts#L70)

Relógio da cena (opcional; sem ele, tempo 0 e uma cópia).

***

### work

> `readonly` **work**: [`WorkSlot`](../../platform/web/interfaces/WorkSlot.md)\<`SurfaceColliderWork`\>

Defined in: [src/elements/physics/flows/SurfaceColliderFlow.ts:72](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SurfaceColliderFlow.ts#L72)

O espaço de trabalho: o rascunho e os parâmetros de cada colisor, o substituto das matrizes (spec 039).

***

### worlds

> `readonly` **worlds**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`true`\>

Defined in: [src/elements/physics/flows/SurfaceColliderFlow.ts:68](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SurfaceColliderFlow.ts#L68)

Pool das matrizes de mundo (transformação por função ou por hierarquia).
