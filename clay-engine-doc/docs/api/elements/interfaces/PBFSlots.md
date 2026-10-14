[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / PBFSlots

# Interface: PBFSlots

Defined in: [elements/physics/flows/PBFFlow.ts:65](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/physics/flows/PBFFlow.ts#L65)

Slots do PBF.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### bodies

> `readonly` **bodies**: `BodiesSlot`

Defined in: [elements/physics/flows/PBFFlow.ts:67](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/physics/flows/PBFFlow.ts#L67)

Pool de corpos do `bodyType` do registro.

***

### colliderPools

> `readonly` **colliderPools**: `PoolsSlot`

Defined in: [elements/physics/flows/PBFFlow.ts:75](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/physics/flows/PBFFlow.ts#L75)

Pools de colliders e de corpos rígidos (cada um presente ou não).

***

### colliders

> `readonly` **colliders**: `EntitiesSlot`

Defined in: [elements/physics/flows/PBFFlow.ts:77](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/physics/flows/PBFFlow.ts#L77)

Entidades com collider (donos dos registros nos pools de collider).

***

### gravity

> `readonly` **gravity**: `SingletonSlot`\<`true`\>

Defined in: [elements/physics/flows/PBFFlow.ts:71](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/physics/flows/PBFFlow.ts#L71)

Campo de gravidade (opcional; padrão `[0, −9,81, 0]`).

***

### material

> `readonly` **material**: `SingletonSlot`\<`true`\>

Defined in: [elements/physics/flows/PBFFlow.ts:73](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/physics/flows/PBFFlow.ts#L73)

Material das partículas (opcional; padrões do solver).

***

### time

> `readonly` **time**: `SingletonSlot`\<`false`\>

Defined in: [elements/physics/flows/PBFFlow.ts:69](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/physics/flows/PBFFlow.ts#L69)

Relógio da cena (passos fixos do quadro).
