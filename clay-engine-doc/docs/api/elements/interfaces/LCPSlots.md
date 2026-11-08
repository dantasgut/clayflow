[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / LCPSlots

# Interface: LCPSlots

Defined in: [src/elements/physics/flows/LCPFlow.ts:154](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/LCPFlow.ts#L154)

Slots do LCP.

## Extends

- [`SlotMap`](../../platform/web/type-aliases/SlotMap.md)

## Indexable

> \[`key`: `string`\]: [`SlotDeclaration`](../../platform/web/type-aliases/SlotDeclaration.md)

## Properties

### bodies

> `readonly` **bodies**: [`BodiesSlot`](../../platform/web/interfaces/BodiesSlot.md)

Defined in: [src/elements/physics/flows/LCPFlow.ts:156](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/LCPFlow.ts#L156)

Pool de corpos do `bodyType` do registro.

***

### colliderPools

> `readonly` **colliderPools**: [`PoolsSlot`](../../platform/web/interfaces/PoolsSlot.md)

Defined in: [src/elements/physics/flows/LCPFlow.ts:162](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/LCPFlow.ts#L162)

Pools de colliders e de corpos rígidos (cada um presente ou não).

***

### colliders

> `readonly` **colliders**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/physics/flows/LCPFlow.ts:164](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/LCPFlow.ts#L164)

Entidades com collider (donos dos registros nos pools de collider).

***

### gravity

> `readonly` **gravity**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/physics/flows/LCPFlow.ts:160](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/LCPFlow.ts#L160)

Campo de gravidade (opcional; padrão `[0, −9,81, 0]`).

***

### poses

> `readonly` **poses**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/physics/flows/LCPFlow.ts:169](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/LCPFlow.ts#L169)

Corpos com `Transform`: registro `RigidPose` (slot do corpo e do `Transform`), lista dos vivos e posse da GPU
sobre o `Transform` — a pose é publicada na GPU (spec 007).

***

### time

> `readonly` **time**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`false`\>

Defined in: [src/elements/physics/flows/LCPFlow.ts:158](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/LCPFlow.ts#L158)

Relógio da cena (passos fixos do quadro).

***

### work

> `readonly` **work**: [`WorkSlot`](../../platform/web/interfaces/WorkSlot.md)\<`LCPWork`\>

Defined in: [src/elements/physics/flows/LCPFlow.ts:174](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/LCPFlow.ts#L174)

O espaço de trabalho do solver (spec 039): parâmetros, contatos, warm start, buffers por corpo, broadphase, grade
hash e o `ColliderSet`.
