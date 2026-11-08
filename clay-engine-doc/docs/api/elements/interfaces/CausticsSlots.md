[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / CausticsSlots

# Interface: CausticsSlots

Defined in: [src/elements/lighting/caustics/CausticsFlow.ts:45](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/caustics/CausticsFlow.ts#L45)

Slots do estágio das cáusticas.

## Extends

- [`SlotMap`](../../platform/web/type-aliases/SlotMap.md)

## Indexable

> \[`key`: `string`\]: [`SlotDeclaration`](../../platform/web/type-aliases/SlotDeclaration.md)

## Properties

### caustics

> `readonly` **caustics**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`false`\>

Defined in: [src/elements/lighting/caustics/CausticsFlow.ts:47](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/caustics/CausticsFlow.ts#L47)

O transporte (o hash e os parâmetros).

***

### rays

> `readonly` **rays**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`false`\>

Defined in: [src/elements/lighting/caustics/CausticsFlow.ts:49](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/caustics/CausticsFlow.ts#L49)

A estrutura de raios: os fótons seguem por ela (e pela superfície dos volumes).

***

### time

> `readonly` **time**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/lighting/caustics/CausticsFlow.ts:51](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/caustics/CausticsFlow.ts#L51)

O tempo simulado (as funções `material` nos acertos).

***

### work

> `readonly` **work**: [`WorkSlot`](../../platform/web/interfaces/WorkSlot.md)\<`CausticsWork`\>

Defined in: [src/elements/lighting/caustics/CausticsFlow.ts:53](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/caustics/CausticsFlow.ts#L53)

O espaço de trabalho do transporte: alvos, instâncias capazes, fótons, fila, a onda (spec 039).
