[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / FEMSlots

# Interface: FEMSlots

Defined in: [src/elements/physics/flows/FEMFlow.ts:41](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/FEMFlow.ts#L41)

Slots do FEM.

## Extends

- [`SlotMap`](../../platform/web/type-aliases/SlotMap.md)

## Indexable

> \[`key`: `string`\]: [`SlotDeclaration`](../../platform/web/type-aliases/SlotDeclaration.md)

## Properties

### bodies

> `readonly` **bodies**: [`BodiesSlot`](../../platform/web/interfaces/BodiesSlot.md)

Defined in: [src/elements/physics/flows/FEMFlow.ts:43](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/FEMFlow.ts#L43)

Pool de corpos do `bodyType` do registro.

***

### colliderPools

> `readonly` **colliderPools**: [`PoolsSlot`](../../platform/web/interfaces/PoolsSlot.md)

Defined in: [src/elements/physics/flows/FEMFlow.ts:49](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/FEMFlow.ts#L49)

Pools dos colliders e dos corpos donos (spec 010: os nós colidem com os colliders).

***

### colliders

> `readonly` **colliders**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/physics/flows/FEMFlow.ts:51](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/FEMFlow.ts#L51)

Entidades com collider.

***

### gravity

> `readonly` **gravity**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/physics/flows/FEMFlow.ts:47](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/FEMFlow.ts#L47)

Campo de gravidade (opcional; padrão `[0, −9,81, 0]`).

***

### time

> `readonly` **time**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`false`\>

Defined in: [src/elements/physics/flows/FEMFlow.ts:45](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/FEMFlow.ts#L45)

Relógio da cena (passos fixos do quadro).

***

### work

> `readonly` **work**: [`WorkSlot`](../../platform/web/interfaces/WorkSlot.md)\<`FEMWork`\>

Defined in: [src/elements/physics/flows/FEMFlow.ts:53](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/FEMFlow.ts#L53)

O espaço de trabalho do solver: parâmetros por iteração e colliders (spec 039).
