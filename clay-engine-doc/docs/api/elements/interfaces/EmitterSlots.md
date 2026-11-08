[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / EmitterSlots

# Interface: EmitterSlots

Defined in: [src/elements/particles/EmitterFlow.ts:42](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/particles/EmitterFlow.ts#L42)

Slots do estágio dos emissores.

## Extends

- [`SlotMap`](../../platform/web/type-aliases/SlotMap.md)

## Indexable

> \[`key`: `string`\]: [`SlotDeclaration`](../../platform/web/type-aliases/SlotDeclaration.md)

## Properties

### colliderPools

> `readonly` **colliderPools**: [`PoolsSlot`](../../platform/web/interfaces/PoolsSlot.md)

Defined in: [src/elements/particles/EmitterFlow.ts:52](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/particles/EmitterFlow.ts#L52)

Pools dos colliders e dos corpos donos (spec 010: as partículas colidem com os colliders).

***

### colliders

> `readonly` **colliders**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/particles/EmitterFlow.ts:54](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/particles/EmitterFlow.ts#L54)

Entidades com collider.

***

### emitters

> `readonly` **emitters**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/particles/EmitterFlow.ts:44](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/particles/EmitterFlow.ts#L44)

Emissores com a nuvem de pontos onde as partículas são desenhadas (o estágio escreve os vértices).

***

### functions

> `readonly` **functions**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/particles/EmitterFlow.ts:46](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/particles/EmitterFlow.ts#L46)

Emissores com `EmitFunction` (registros nos pools das formas, spec 031).

***

### gravity

> `readonly` **gravity**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/particles/EmitterFlow.ts:48](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/particles/EmitterFlow.ts#L48)

Gravidade uniforme (opcional; padrão −9,81 em y).

***

### time

> `readonly` **time**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`false`\>

Defined in: [src/elements/particles/EmitterFlow.ts:50](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/particles/EmitterFlow.ts#L50)

Relógio da cena.

***

### work

> `readonly` **work**: [`WorkSlot`](../../platform/web/interfaces/WorkSlot.md)\<`EmitterWork`\>

Defined in: [src/elements/particles/EmitterFlow.ts:56](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/particles/EmitterFlow.ts#L56)

O espaço de trabalho do estágio: os parâmetros por passo de cada emissor e os colliders (spec 039).
