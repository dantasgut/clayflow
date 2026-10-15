[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / FEMSlots

# Interface: FEMSlots

Defined in: [elements/physics/flows/FEMFlow.ts:41](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/FEMFlow.ts#L41)

Slots do FEM.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### bodies

> `readonly` **bodies**: `BodiesSlot`

Defined in: [elements/physics/flows/FEMFlow.ts:43](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/FEMFlow.ts#L43)

Pool de corpos do `bodyType` do registro.

***

### colliderPools

> `readonly` **colliderPools**: `PoolsSlot`

Defined in: [elements/physics/flows/FEMFlow.ts:49](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/FEMFlow.ts#L49)

Pools dos colliders e dos corpos donos (spec 010: os nós colidem com os colliders).

***

### colliders

> `readonly` **colliders**: `EntitiesSlot`

Defined in: [elements/physics/flows/FEMFlow.ts:51](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/FEMFlow.ts#L51)

Entidades com collider.

***

### gravity

> `readonly` **gravity**: `SingletonSlot`\<`true`\>

Defined in: [elements/physics/flows/FEMFlow.ts:47](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/FEMFlow.ts#L47)

Campo de gravidade (opcional; padrão `[0, −9,81, 0]`).

***

### time

> `readonly` **time**: `SingletonSlot`\<`false`\>

Defined in: [elements/physics/flows/FEMFlow.ts:45](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/FEMFlow.ts#L45)

Relógio da cena (passos fixos do quadro).
