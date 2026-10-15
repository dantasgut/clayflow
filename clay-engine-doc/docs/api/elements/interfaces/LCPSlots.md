[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / LCPSlots

# Interface: LCPSlots

Defined in: [elements/physics/flows/LCPFlow.ts:134](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/flows/LCPFlow.ts#L134)

Slots do LCP.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### bodies

> `readonly` **bodies**: `BodiesSlot`

Defined in: [elements/physics/flows/LCPFlow.ts:136](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/flows/LCPFlow.ts#L136)

Pool de corpos do `bodyType` do registro.

***

### colliderPools

> `readonly` **colliderPools**: `PoolsSlot`

Defined in: [elements/physics/flows/LCPFlow.ts:142](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/flows/LCPFlow.ts#L142)

Pools de colliders e de corpos rígidos (cada um presente ou não).

***

### colliders

> `readonly` **colliders**: `EntitiesSlot`

Defined in: [elements/physics/flows/LCPFlow.ts:144](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/flows/LCPFlow.ts#L144)

Entidades com collider (donos dos registros nos pools de collider).

***

### gravity

> `readonly` **gravity**: `SingletonSlot`\<`true`\>

Defined in: [elements/physics/flows/LCPFlow.ts:140](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/flows/LCPFlow.ts#L140)

Campo de gravidade (opcional; padrão `[0, −9,81, 0]`).

***

### poses

> `readonly` **poses**: `EntitiesSlot`

Defined in: [elements/physics/flows/LCPFlow.ts:149](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/flows/LCPFlow.ts#L149)

Corpos com `Transform`: registro `RigidPose` (slot do corpo e do `Transform`), lista dos vivos e posse da GPU
sobre o `Transform` — a pose é publicada na GPU (spec 007).

***

### time

> `readonly` **time**: `SingletonSlot`\<`false`\>

Defined in: [elements/physics/flows/LCPFlow.ts:138](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/flows/LCPFlow.ts#L138)

Relógio da cena (passos fixos do quadro).
