[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SurfaceColliderSlots

# Interface: SurfaceColliderSlots

Defined in: [elements/physics/flows/SurfaceColliderFlow.ts:49](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/SurfaceColliderFlow.ts#L49)

Slots do estágio dos colliders de superfície.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### colliders

> `readonly` **colliders**: `EntitiesSlot`

Defined in: [elements/physics/flows/SurfaceColliderFlow.ts:51](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/SurfaceColliderFlow.ts#L51)

Superfícies colidíveis.

***

### fields

> `readonly` **fields**: `PoolSlot`\<`false`\>

Defined in: [elements/physics/flows/SurfaceColliderFlow.ts:55](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/SurfaceColliderFlow.ts#L55)

Pool do campo (cabeçalho e valores de todos os colliders de superfície).

***

### fnRecords

> `readonly` **fnRecords**: `PoolSlot`\<`true`\>

Defined in: [elements/physics/flows/SurfaceColliderFlow.ts:57](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/SurfaceColliderFlow.ts#L57)

Pool dos registros das `SurfaceFunction` (opcional).

***

### functions

> `readonly` **functions**: `EntitiesSlot`

Defined in: [elements/physics/flows/SurfaceColliderFlow.ts:53](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/SurfaceColliderFlow.ts#L53)

Superfícies colidíveis com `SurfaceFunction`.

***

### spaceRecords

> `readonly` **spaceRecords**: `PoolSlot`\<`true`\>

Defined in: [elements/physics/flows/SurfaceColliderFlow.ts:59](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/SurfaceColliderFlow.ts#L59)

Pool dos registros das `SpaceFunction` (existe com espaço na cena: a superfície anima).

***

### time

> `readonly` **time**: `SingletonSlot`\<`true`\>

Defined in: [elements/physics/flows/SurfaceColliderFlow.ts:63](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/SurfaceColliderFlow.ts#L63)

Relógio da cena (opcional; sem ele, tempo 0 e uma cópia).

***

### worlds

> `readonly` **worlds**: `PoolSlot`\<`true`\>

Defined in: [elements/physics/flows/SurfaceColliderFlow.ts:61](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/SurfaceColliderFlow.ts#L61)

Pool das matrizes de mundo (transformação por função ou por hierarquia).
