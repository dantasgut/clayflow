[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / TransformSlots

# Interface: TransformSlots

Defined in: [src/elements/scene/flows/TransformFlow.ts:47](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/TransformFlow.ts#L47)

Slots do estágio de transformação.

## Extends

- [`SlotMap`](../../platform/web/type-aliases/SlotMap.md)

## Indexable

> \[`key`: `string`\]: [`SlotDeclaration`](../../platform/web/type-aliases/SlotDeclaration.md)

## Properties

### children

> `readonly` **children**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/scene/flows/TransformFlow.ts:57](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/TransformFlow.ts#L57)

Entidades com `Transform` e `Parent` (a hierarquia opcional).

***

### entities

> `readonly` **entities**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/scene/flows/TransformFlow.ts:55](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/TransformFlow.ts#L55)

Entidades com `Transform` (remoções recompõem).

***

### functions

> `readonly` **functions**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/scene/flows/TransformFlow.ts:59](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/TransformFlow.ts#L59)

Entidades com `Transform` e `TransformFunction` (spec 009; registros nos pools das formas, spec 031).

***

### inverses

> `readonly` **inverses**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`false`\>

Defined in: [src/elements/scene/flows/TransformFlow.ts:53](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/TransformFlow.ts#L53)

Pool das inversas `WorldInverse` (saída sob demanda, spec 037: escrito só depois que um leitor o pede).

***

### time

> `readonly` **time**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/scene/flows/TransformFlow.ts:61](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/TransformFlow.ts#L61)

Relógio da cena (tempo simulado das funções; sem relógio, 0).

***

### transforms

> `readonly` **transforms**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`false`\>

Defined in: [src/elements/scene/flows/TransformFlow.ts:49](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/TransformFlow.ts#L49)

Pool das intenções `Transform` (entrada da composição).

***

### work

> `readonly` **work**: [`WorkSlot`](../../platform/web/interfaces/WorkSlot.md)\<`TransformWork`\>

Defined in: [src/elements/scene/flows/TransformFlow.ts:63](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/TransformFlow.ts#L63)

O espaço de trabalho do estágio: parâmetros, elos, pares das funções e regiões por nível e grupo (spec 039).

***

### worlds

> `readonly` **worlds**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`false`\>

Defined in: [src/elements/scene/flows/TransformFlow.ts:51](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/TransformFlow.ts#L51)

Pool das matrizes de mundo `WorldTransform` (saída).
