[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SPHSlots

# Interface: SPHSlots

Defined in: [elements/physics/flows/SPHFlow.ts:50](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/SPHFlow.ts#L50)

Slots do SPH.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### bodies

> `readonly` **bodies**: `BodiesSlot`

Defined in: [elements/physics/flows/SPHFlow.ts:52](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/SPHFlow.ts#L52)

Pool de corpos do `bodyType` do registro.

***

### colliderPools

> `readonly` **colliderPools**: `PoolsSlot`

Defined in: [elements/physics/flows/SPHFlow.ts:60](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/SPHFlow.ts#L60)

Pools de colliders e de corpos rígidos (cada um presente ou não).

***

### colliders

> `readonly` **colliders**: `EntitiesSlot`

Defined in: [elements/physics/flows/SPHFlow.ts:62](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/SPHFlow.ts#L62)

Entidades com collider (donos dos registros nos pools de collider).

***

### gravity

> `readonly` **gravity**: `SingletonSlot`\<`true`\>

Defined in: [elements/physics/flows/SPHFlow.ts:56](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/SPHFlow.ts#L56)

Campo de gravidade (opcional; padrão `[0, −9,81, 0]`).

***

### material

> `readonly` **material**: `SingletonSlot`\<`true`\>

Defined in: [elements/physics/flows/SPHFlow.ts:58](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/SPHFlow.ts#L58)

Material das partículas (opcional; padrões do solver).

***

### time

> `readonly` **time**: `SingletonSlot`\<`false`\>

Defined in: [elements/physics/flows/SPHFlow.ts:54](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/SPHFlow.ts#L54)

Relógio da cena (passos fixos do quadro).
