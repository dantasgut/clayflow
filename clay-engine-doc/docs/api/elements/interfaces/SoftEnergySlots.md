[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / SoftEnergySlots

# Interface: SoftEnergySlots

Defined in: [src/elements/physics/energy/SoftEnergyFlow.ts:48](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/energy/SoftEnergyFlow.ts#L48)

Slots do estágio da energia dos corpos moles.

## Extends

- [`SlotMap`](../../platform/web/type-aliases/SlotMap.md)

## Indexable

> \[`key`: `string`\]: [`SlotDeclaration`](../../platform/web/type-aliases/SlotDeclaration.md)

## Properties

### chunks

> `readonly` **chunks**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`false`\>

Defined in: [src/elements/physics/energy/SoftEnergyFlow.ts:53](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/energy/SoftEnergyFlow.ts#L53)

***

### edges

> `readonly` **edges**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`true`\>

Defined in: [src/elements/physics/energy/SoftEnergyFlow.ts:64](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/energy/SoftEnergyFlow.ts#L64)

***

### fem

> `readonly` **fem**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`true`\>

Defined in: [src/elements/physics/energy/SoftEnergyFlow.ts:62](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/energy/SoftEnergyFlow.ts#L62)

***

### gravity

> `readonly` **gravity**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/physics/energy/SoftEnergyFlow.ts:57](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/energy/SoftEnergyFlow.ts#L57)

A gravidade uniforme (sem ela, a padrão dos solvers: 0, −9,81, 0).

***

### meter

> `readonly` **meter**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`false`\>

Defined in: [src/elements/physics/energy/SoftEnergyFlow.ts:50](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/energy/SoftEnergyFlow.ts#L50)

O medidor (sem ele, o estágio fica pendente: nada calculado nem alocado).

***

### mpm

> `readonly` **mpm**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`true`\>

Defined in: [src/elements/physics/energy/SoftEnergyFlow.ts:63](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/energy/SoftEnergyFlow.ts#L63)

***

### physics

> `readonly` **physics**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/physics/energy/SoftEnergyFlow.ts:59](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/energy/SoftEnergyFlow.ts#L59)

A física das partículas (a massa, o volume e a rigidez do MPM; sem ele, o padrão).

***

### ranges

> `readonly` **ranges**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`false`\>

Defined in: [src/elements/physics/energy/SoftEnergyFlow.ts:52](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/energy/SoftEnergyFlow.ts#L52)

As faixas dos corpos moles (um registro por corpo) e os blocos (um registro por bloco).

***

### softEnergy

> `readonly` **softEnergy**: `ChannelSlot`\<`false`\>

Defined in: [src/elements/physics/energy/SoftEnergyFlow.ts:66](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/energy/SoftEnergyFlow.ts#L66)

A série da energia (o canal do pool `SoftBodyEnergy`).

***

### time

> `readonly` **time**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`false`\>

Defined in: [src/elements/physics/energy/SoftEnergyFlow.ts:55](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/energy/SoftEnergyFlow.ts#L55)

O tempo da cena (os passos do quadro).

***

### work

> `readonly` **work**: [`WorkSlot`](../../platform/web/interfaces/WorkSlot.md)\<`SoftEnergyWork`\>

Defined in: [src/elements/physics/energy/SoftEnergyFlow.ts:68](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/energy/SoftEnergyFlow.ts#L68)

O espaço de trabalho: as regiões de parâmetros por algoritmo e a da soma (spec 039).

***

### xpbd

> `readonly` **xpbd**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`true`\>

Defined in: [src/elements/physics/energy/SoftEnergyFlow.ts:61](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/energy/SoftEnergyFlow.ts#L61)

As partículas de cada algoritmo e as arestas do XPBD (cada pipeline existe com o pool dele).
