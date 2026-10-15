[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / LCPSlots

# Interface: LCPSlots

Defined in: [elements/physics/flows/LCPFlow.ts:141](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/LCPFlow.ts#L141)

Slots do LCP.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### bodies

> `readonly` **bodies**: `BodiesSlot`

Defined in: [elements/physics/flows/LCPFlow.ts:143](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/LCPFlow.ts#L143)

Pool de corpos do `bodyType` do registro.

***

### colliderPools

> `readonly` **colliderPools**: `PoolsSlot`

Defined in: [elements/physics/flows/LCPFlow.ts:149](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/LCPFlow.ts#L149)

Pools de colliders e de corpos rígidos (cada um presente ou não).

***

### colliders

> `readonly` **colliders**: `EntitiesSlot`

Defined in: [elements/physics/flows/LCPFlow.ts:151](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/LCPFlow.ts#L151)

Entidades com collider (donos dos registros nos pools de collider).

***

### gravity

> `readonly` **gravity**: `SingletonSlot`\<`true`\>

Defined in: [elements/physics/flows/LCPFlow.ts:147](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/LCPFlow.ts#L147)

Campo de gravidade (opcional; padrão `[0, −9,81, 0]`).

***

### poses

> `readonly` **poses**: `EntitiesSlot`

Defined in: [elements/physics/flows/LCPFlow.ts:156](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/LCPFlow.ts#L156)

Corpos com `Transform`: registro `RigidPose` (slot do corpo e do `Transform`), lista dos vivos e posse da GPU
sobre o `Transform` — a pose é publicada na GPU (spec 007).

***

### time

> `readonly` **time**: `SingletonSlot`\<`false`\>

Defined in: [elements/physics/flows/LCPFlow.ts:145](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/LCPFlow.ts#L145)

Relógio da cena (passos fixos do quadro).
