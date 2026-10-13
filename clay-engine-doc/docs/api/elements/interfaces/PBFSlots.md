[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / PBFSlots

# Interface: PBFSlots

Defined in: [elements/physics/flows/PBFFlow.ts:64](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/physics/flows/PBFFlow.ts#L64)

Slots do PBF.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### bodies

> `readonly` **bodies**: `BodiesSlot`

Defined in: [elements/physics/flows/PBFFlow.ts:66](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/physics/flows/PBFFlow.ts#L66)

Pool de corpos do `bodyType` do registro.

***

### colliderPools

> `readonly` **colliderPools**: `PoolsSlot`

Defined in: [elements/physics/flows/PBFFlow.ts:74](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/physics/flows/PBFFlow.ts#L74)

Pools de colliders e de corpos rígidos (cada um presente ou não).

***

### colliders

> `readonly` **colliders**: `EntitiesSlot`

Defined in: [elements/physics/flows/PBFFlow.ts:76](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/physics/flows/PBFFlow.ts#L76)

Entidades com collider (donos dos registros nos pools de collider).

***

### gravity

> `readonly` **gravity**: `SingletonSlot`\<`true`\>

Defined in: [elements/physics/flows/PBFFlow.ts:70](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/physics/flows/PBFFlow.ts#L70)

Campo de gravidade (opcional; padrão `[0, −9,81, 0]`).

***

### material

> `readonly` **material**: `SingletonSlot`\<`true`\>

Defined in: [elements/physics/flows/PBFFlow.ts:72](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/physics/flows/PBFFlow.ts#L72)

Material das partículas (opcional; padrões do solver).

***

### time

> `readonly` **time**: `SingletonSlot`\<`false`\>

Defined in: [elements/physics/flows/PBFFlow.ts:68](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/physics/flows/PBFFlow.ts#L68)

Relógio da cena (passos fixos do quadro).
