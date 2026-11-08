[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / SPHSlots

# Interface: SPHSlots

Defined in: [src/elements/physics/flows/SPHFlow.ts:60](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SPHFlow.ts#L60)

Slots do SPH.

## Extends

- [`SlotMap`](../../platform/web/type-aliases/SlotMap.md)

## Indexable

> \[`key`: `string`\]: [`SlotDeclaration`](../../platform/web/type-aliases/SlotDeclaration.md)

## Properties

### bodies

> `readonly` **bodies**: [`BodiesSlot`](../../platform/web/interfaces/BodiesSlot.md)

Defined in: [src/elements/physics/flows/SPHFlow.ts:62](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SPHFlow.ts#L62)

Pool de corpos do `bodyType` do registro.

***

### boundary

> `readonly` **boundary**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`false`\>

Defined in: [src/elements/physics/flows/SPHFlow.ts:76](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SPHFlow.ts#L76)

Fronteira sólida por partícula (pool do corpo, mesmo slot; Σ −B' n, Σ B; Akinci et al. 2012).

***

### colliderPools

> `readonly` **colliderPools**: [`PoolsSlot`](../../platform/web/interfaces/PoolsSlot.md)

Defined in: [src/elements/physics/flows/SPHFlow.ts:70](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SPHFlow.ts#L70)

Pools de colliders e de corpos rígidos (cada um presente ou não).

***

### colliders

> `readonly` **colliders**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/physics/flows/SPHFlow.ts:72](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SPHFlow.ts#L72)

Entidades com collider (donos dos registros nos pools de collider).

***

### gravity

> `readonly` **gravity**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/physics/flows/SPHFlow.ts:66](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SPHFlow.ts#L66)

Campo de gravidade (opcional; padrão `[0, −9,81, 0]`).

***

### normals

> `readonly` **normals**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`false`\>

Defined in: [src/elements/physics/flows/SPHFlow.ts:74](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SPHFlow.ts#L74)

Normais de superfície por partícula (pool do corpo, mesmo slot; tensão superficial de Akinci, spec 030).

***

### physics

> `readonly` **physics**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/physics/flows/SPHFlow.ts:68](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SPHFlow.ts#L68)

Comportamento das partículas (opcional; padrões do solver).

***

### time

> `readonly` **time**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`false`\>

Defined in: [src/elements/physics/flows/SPHFlow.ts:64](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SPHFlow.ts#L64)

Relógio da cena (passos fixos do quadro).

***

### work

> `readonly` **work**: [`WorkSlot`](../../platform/web/interfaces/WorkSlot.md)\<`SPHWork`\>

Defined in: [src/elements/physics/flows/SPHFlow.ts:78](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SPHFlow.ts#L78)

O espaço de trabalho do solver: parâmetros por iteração, vizinhança, colliders (spec 039).
