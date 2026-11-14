[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / MPMSlots

# Interface: MPMSlots

Defined in: [src/elements/physics/flows/MPMFlow.ts:47](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/MPMFlow.ts#L47)

Slots do MPM.

## Extends

- [`SlotMap`](../../platform/web/type-aliases/SlotMap.md)

## Indexable

> \[`key`: `string`\]: [`SlotDeclaration`](../../platform/web/type-aliases/SlotDeclaration.md)

## Properties

### bodies

> `readonly` **bodies**: [`BodiesSlot`](../../platform/web/interfaces/BodiesSlot.md)

Defined in: [src/elements/physics/flows/MPMFlow.ts:49](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/MPMFlow.ts#L49)

Pool de corpos do `bodyType` do registro.

***

### colliderPools

> `readonly` **colliderPools**: [`PoolsSlot`](../../platform/web/interfaces/PoolsSlot.md)

Defined in: [src/elements/physics/flows/MPMFlow.ts:57](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/MPMFlow.ts#L57)

Pools de colliders e de corpos rígidos (cada um presente ou não).

***

### colliders

> `readonly` **colliders**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/physics/flows/MPMFlow.ts:59](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/MPMFlow.ts#L59)

Entidades com collider (donos dos registros nos pools de collider).

***

### gravity

> `readonly` **gravity**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/physics/flows/MPMFlow.ts:53](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/MPMFlow.ts#L53)

Campo de gravidade (opcional; padrão `[0, −9,81, 0]`).

***

### physics

> `readonly` **physics**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/physics/flows/MPMFlow.ts:55](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/MPMFlow.ts#L55)

Comportamento das partículas (opcional; padrões do solver).

***

### time

> `readonly` **time**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`false`\>

Defined in: [src/elements/physics/flows/MPMFlow.ts:51](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/MPMFlow.ts#L51)

Relógio da cena (passos fixos do quadro).

***

### work

> `readonly` **work**: [`WorkSlot`](../../platform/web/interfaces/WorkSlot.md)\<`MPMWork`\>

Defined in: [src/elements/physics/flows/MPMFlow.ts:61](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/MPMFlow.ts#L61)

O espaço de trabalho do solver: a grade do domínio, os parâmetros por iteração, os colliders (spec 039).
