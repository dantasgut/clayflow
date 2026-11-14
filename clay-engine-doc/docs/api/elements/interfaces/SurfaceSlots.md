[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / SurfaceSlots

# Interface: SurfaceSlots

Defined in: [src/elements/geometry/SurfaceFlow.ts:76](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/SurfaceFlow.ts#L76)

Slots do estágio das superfícies paramétricas.

## Extends

- [`SlotMap`](../../platform/web/type-aliases/SlotMap.md)

## Indexable

> \[`key`: `string`\]: [`SlotDeclaration`](../../platform/web/type-aliases/SlotDeclaration.md)

## Properties

### camera

> `readonly` **camera**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/geometry/SurfaceFlow.ts:88](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/SurfaceFlow.ts#L88)

Câmera ativa (malha adaptativa: distância).

***

### cameras

> `readonly` **cameras**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`true`\>

Defined in: [src/elements/geometry/SurfaceFlow.ts:90](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/SurfaceFlow.ts#L90)

Matrizes das câmeras (só GPU).

***

### diffs

> `readonly` **diffs**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`true`\>

Defined in: [src/elements/geometry/SurfaceFlow.ts:86](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/SurfaceFlow.ts#L86)

Pool da geometria diferencial (existe com superfícies `differential`).

***

### functions

> `readonly` **functions**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/geometry/SurfaceFlow.ts:80](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/SurfaceFlow.ts#L80)

Superfícies com `SurfaceFunction` (registros nos pools das formas, spec 031).

***

### spaces

> `readonly` **spaces**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/geometry/SurfaceFlow.ts:82](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/SurfaceFlow.ts#L82)

Funções `space` da cena (com alguma: avaliação a cada quadro).

***

### surfaces

> `readonly` **surfaces**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/geometry/SurfaceFlow.ts:78](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/SurfaceFlow.ts#L78)

Superfícies paramétricas (o estágio escreve os vértices).

***

### time

> `readonly` **time**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/geometry/SurfaceFlow.ts:84](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/SurfaceFlow.ts#L84)

Relógio da cena (opcional; sem ele, tempo 0).

***

### work

> `readonly` **work**: [`WorkSlot`](../../platform/web/interfaces/WorkSlot.md)\<`SurfaceWork`\>

Defined in: [src/elements/geometry/SurfaceFlow.ts:94](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/SurfaceFlow.ts#L94)

O espaço de trabalho do estágio: o substituto dos pools ausentes da malha adaptativa (spec 039).

***

### worlds

> `readonly` **worlds**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`true`\>

Defined in: [src/elements/geometry/SurfaceFlow.ts:92](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/SurfaceFlow.ts#L92)

Matrizes de mundo (malha adaptativa: a superfície na cena).
