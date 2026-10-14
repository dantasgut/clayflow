[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / PBFSlots

# Interface: PBFSlots

Defined in: [elements/physics/flows/PBFFlow.ts:66](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/flows/PBFFlow.ts#L66)

Slots do PBF.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### bodies

> `readonly` **bodies**: `BodiesSlot`

Defined in: [elements/physics/flows/PBFFlow.ts:68](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/flows/PBFFlow.ts#L68)

Pool de corpos do `bodyType` do registro.

***

### colliderPools

> `readonly` **colliderPools**: `PoolsSlot`

Defined in: [elements/physics/flows/PBFFlow.ts:76](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/flows/PBFFlow.ts#L76)

Pools de colliders e de corpos rígidos (cada um presente ou não).

***

### colliders

> `readonly` **colliders**: `EntitiesSlot`

Defined in: [elements/physics/flows/PBFFlow.ts:78](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/flows/PBFFlow.ts#L78)

Entidades com collider (donos dos registros nos pools de collider).

***

### gravity

> `readonly` **gravity**: `SingletonSlot`\<`true`\>

Defined in: [elements/physics/flows/PBFFlow.ts:72](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/flows/PBFFlow.ts#L72)

Campo de gravidade (opcional; padrão `[0, −9,81, 0]`).

***

### material

> `readonly` **material**: `SingletonSlot`\<`true`\>

Defined in: [elements/physics/flows/PBFFlow.ts:74](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/flows/PBFFlow.ts#L74)

Material das partículas (opcional; padrões do solver).

***

### time

> `readonly` **time**: `SingletonSlot`\<`false`\>

Defined in: [elements/physics/flows/PBFFlow.ts:70](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/flows/PBFFlow.ts#L70)

Relógio da cena (passos fixos do quadro).
