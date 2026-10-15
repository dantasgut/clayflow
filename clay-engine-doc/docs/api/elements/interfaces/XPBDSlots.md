[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / XPBDSlots

# Interface: XPBDSlots

Defined in: [elements/physics/flows/XPBDFlow.ts:41](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/XPBDFlow.ts#L41)

Slots do XPBD.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### bodies

> `readonly` **bodies**: `BodiesSlot`

Defined in: [elements/physics/flows/XPBDFlow.ts:43](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/XPBDFlow.ts#L43)

Pool de corpos do `bodyType` do registro.

***

### colliderPools

> `readonly` **colliderPools**: `PoolsSlot`

Defined in: [elements/physics/flows/XPBDFlow.ts:51](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/XPBDFlow.ts#L51)

Pools dos colliders e dos corpos donos (spec 010: as partículas colidem com os colliders).

***

### colliders

> `readonly` **colliders**: `EntitiesSlot`

Defined in: [elements/physics/flows/XPBDFlow.ts:53](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/XPBDFlow.ts#L53)

Entidades com collider.

***

### constraints

> `readonly` **constraints**: `PoolSlot`\<`true`\>

Defined in: [elements/physics/flows/XPBDFlow.ts:47](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/XPBDFlow.ts#L47)

Pool das restrições de distância (opcional).

***

### gravity

> `readonly` **gravity**: `SingletonSlot`\<`true`\>

Defined in: [elements/physics/flows/XPBDFlow.ts:49](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/XPBDFlow.ts#L49)

Campo de gravidade (opcional; padrão `[0, −9,81, 0]`).

***

### time

> `readonly` **time**: `SingletonSlot`\<`false`\>

Defined in: [elements/physics/flows/XPBDFlow.ts:45](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/XPBDFlow.ts#L45)

Relógio da cena (passos fixos do quadro).
