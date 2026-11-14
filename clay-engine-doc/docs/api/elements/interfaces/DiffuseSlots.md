[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / DiffuseSlots

# Interface: DiffuseSlots

Defined in: [src/elements/particles/DiffuseFlow.ts:55](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/particles/DiffuseFlow.ts#L55)

Slots do estágio das partículas secundárias.

## Extends

- [`SlotMap`](../../platform/web/type-aliases/SlotMap.md)

## Indexable

> \[`key`: `string`\]: [`SlotDeclaration`](../../platform/web/type-aliases/SlotDeclaration.md)

## Properties

### colliderPools

> `readonly` **colliderPools**: [`PoolsSlot`](../../platform/web/interfaces/PoolsSlot.md)

Defined in: [src/elements/particles/DiffuseFlow.ts:65](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/particles/DiffuseFlow.ts#L65)

Pools dos colliders e dos corpos donos (o spray colide com os sólidos da cena).

***

### colliders

> `readonly` **colliders**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/particles/DiffuseFlow.ts:67](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/particles/DiffuseFlow.ts#L67)

Entidades com collider.

***

### diffuse

> `readonly` **diffuse**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/particles/DiffuseFlow.ts:57](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/particles/DiffuseFlow.ts#L57)

Partículas secundárias com a nuvem de pontos onde são desenhadas (o estágio escreve os vértices).

***

### gravity

> `readonly` **gravity**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/particles/DiffuseFlow.ts:61](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/particles/DiffuseFlow.ts#L61)

Gravidade uniforme (opcional; padrão −9,81 em y).

***

### physics

> `readonly` **physics**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/particles/DiffuseFlow.ts:63](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/particles/DiffuseFlow.ts#L63)

Comportamento das partículas do fluido (espaçamento, domínio).

***

### time

> `readonly` **time**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`false`\>

Defined in: [src/elements/particles/DiffuseFlow.ts:59](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/particles/DiffuseFlow.ts#L59)

Relógio da cena.

***

### work

> `readonly` **work**: [`WorkSlot`](../../platform/web/interfaces/WorkSlot.md)\<`DiffuseWork`\>

Defined in: [src/elements/particles/DiffuseFlow.ts:69](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/particles/DiffuseFlow.ts#L69)

O espaço de trabalho do estágio: o de cada entidade de secundárias e os colliders (spec 039).
