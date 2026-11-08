[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / EnergySlots

# Interface: EnergySlots

Defined in: [src/elements/physics/energy/EnergyFlow.ts:24](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/energy/EnergyFlow.ts#L24)

Slots do estágio da energia.

## Extends

- [`SlotMap`](../../platform/web/type-aliases/SlotMap.md)

## Indexable

> \[`key`: `string`\]: [`SlotDeclaration`](../../platform/web/type-aliases/SlotDeclaration.md)

## Properties

### bodies

> `readonly` **bodies**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`false`\>

Defined in: [src/elements/physics/energy/EnergyFlow.ts:28](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/energy/EnergyFlow.ts#L28)

Os corpos do LCP.

***

### bodyEnergy

> `readonly` **bodyEnergy**: `ChannelSlot`\<`false`\>

Defined in: [src/elements/physics/energy/EnergyFlow.ts:34](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/energy/EnergyFlow.ts#L34)

A série da energia (o canal do pool `BodyEnergy`).

***

### gravity

> `readonly` **gravity**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/physics/energy/EnergyFlow.ts:32](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/energy/EnergyFlow.ts#L32)

A gravidade uniforme (sem ela, a padrão do solver: 0, −9,81, 0).

***

### meter

> `readonly` **meter**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`false`\>

Defined in: [src/elements/physics/energy/EnergyFlow.ts:26](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/energy/EnergyFlow.ts#L26)

O medidor (sem ele, o estágio fica pendente: nada calculado nem alocado).

***

### time

> `readonly` **time**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`false`\>

Defined in: [src/elements/physics/energy/EnergyFlow.ts:30](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/energy/EnergyFlow.ts#L30)

O tempo da cena (os passos do quadro).
