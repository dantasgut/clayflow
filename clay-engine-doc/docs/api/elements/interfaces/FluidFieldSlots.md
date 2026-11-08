[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / FluidFieldSlots

# Interface: FluidFieldSlots

Defined in: [src/elements/fields/FluidFieldFlow.ts:92](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/fields/FluidFieldFlow.ts#L92)

Slots do estágio do campo.

## Extends

- [`SlotMap`](../../platform/web/type-aliases/SlotMap.md)

## Indexable

> \[`key`: `string`\]: [`SlotDeclaration`](../../platform/web/type-aliases/SlotDeclaration.md)

## Properties

### atmosphere

> `readonly` **atmosphere**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/fields/FluidFieldFlow.ts:112](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/fields/FluidFieldFlow.ts#L112)

O ar da cena: a evaporação da película (sem ele, `Atmosphere.defaults`).

***

### bodies

> `readonly` **bodies**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/fields/FluidFieldFlow.ts:96](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/fields/FluidFieldFlow.ts#L96)

Os corpos de partículas (os de superfície de fluido, `isFieldBody`, entram no campo).

***

### colliderPools

> `readonly` **colliderPools**: [`PoolsSlot`](../../platform/web/interfaces/PoolsSlot.md)

Defined in: [src/elements/fields/FluidFieldFlow.ts:106](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/fields/FluidFieldFlow.ts#L106)

Pools de colliders e de corpos rígidos: a superfície dos sólidos, por onde a película escorre (spec 034).

***

### colliders

> `readonly` **colliders**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/fields/FluidFieldFlow.ts:108](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/fields/FluidFieldFlow.ts#L108)

Entidades com collider.

***

### field

> `readonly` **field**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`false`\>

Defined in: [src/elements/fields/FluidFieldFlow.ts:94](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/fields/FluidFieldFlow.ts#L94)

O campo da cena (inserido pelos estágios padrão).

***

### gravity

> `readonly` **gravity**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/fields/FluidFieldFlow.ts:104](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/fields/FluidFieldFlow.ts#L104)

A gravidade: o escoamento da película de água nos sólidos (spec 034; sem ela, −9,81 em y).

***

### particlePhysics

> `readonly` **particlePhysics**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/fields/FluidFieldFlow.ts:100](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/fields/FluidFieldFlow.ts#L100)

A física das partículas (o espaçamento).

***

### rays

> `readonly` **rays**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/fields/FluidFieldFlow.ts:98](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/fields/FluidFieldFlow.ts#L98)

A estrutura de raios: a composição das funções `material` dos acertos, onde a do corpo tem o seu índice.

***

### surfaces

> `readonly` **surfaces**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/fields/FluidFieldFlow.ts:110](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/fields/FluidFieldFlow.ts#L110)

A física da superfície dos sólidos (spec 034): rugosidade, histerese, poros, temperatura.

***

### time

> `readonly` **time**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/fields/FluidFieldFlow.ts:102](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/fields/FluidFieldFlow.ts#L102)

O tempo da cena: o nível da superfície só se ajusta nos quadros em que a simulação avança.

***

### work

> `readonly` **work**: [`WorkSlot`](../../platform/web/interfaces/WorkSlot.md)\<`FieldWork`\>

Defined in: [src/elements/fields/FluidFieldFlow.ts:114](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/fields/FluidFieldFlow.ts#L114)

O espaço de trabalho da junção e da reconstrução: temporários, grade, regiões, a onda (spec 039).
