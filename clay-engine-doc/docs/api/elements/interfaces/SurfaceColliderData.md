[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SurfaceColliderData

# Interface: SurfaceColliderData

Defined in: [elements/physics/colliders/SurfaceCollider.ts:51](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/colliders/SurfaceCollider.ts#L51)

Dado de um `SurfaceCollider` (layout de `SurfaceCollider.schema`).

## Properties

### \_pad0

> **\_pad0**: `number`

Defined in: [elements/physics/colliders/SurfaceCollider.ts:71](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/colliders/SurfaceCollider.ts#L71)

Preenchimento do layout.

***

### \_pad1

> **\_pad1**: `number`

Defined in: [elements/physics/colliders/SurfaceCollider.ts:73](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/colliders/SurfaceCollider.ts#L73)

Preenchimento do layout.

***

### \_pad2

> **\_pad2**: `number`

Defined in: [elements/physics/colliders/SurfaceCollider.ts:75](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/colliders/SurfaceCollider.ts#L75)

Preenchimento do layout.

***

### band

> **band**: `number`

Defined in: [elements/physics/colliders/SurfaceCollider.ts:67](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/colliders/SurfaceCollider.ts#L67)

Células de folga (distância).

***

### copies

> **copies**: `number`

Defined in: [elements/physics/colliders/SurfaceCollider.ts:63](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/colliders/SurfaceCollider.ts#L63)

Cópias alocadas.

***

### copy\_stride

> **copy\_stride**: `number`

Defined in: [elements/physics/colliders/SurfaceCollider.ts:65](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/colliders/SurfaceCollider.ts#L65)

Floats por cópia (cabeçalho + células).

***

### first

> **first**: `number`

Defined in: [elements/physics/colliders/SurfaceCollider.ts:61](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/colliders/SurfaceCollider.ts#L61)

Primeiro slot do campo (índice local 0, resolvido pela C2).

***

### margin

> **margin**: `number`

Defined in: [elements/physics/colliders/SurfaceCollider.ts:69](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/colliders/SurfaceCollider.ts#L69)

Folga de contato (m).

***

### mode

> **mode**: `number`

Defined in: [elements/physics/colliders/SurfaceCollider.ts:53](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/colliders/SurfaceCollider.ts#L53)

Modo (`SURFACE_COLLIDER_MODE_INDEX`).

***

### nx

> **nx**: `number`

Defined in: [elements/physics/colliders/SurfaceCollider.ts:55](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/colliders/SurfaceCollider.ts#L55)

Células em x.

***

### ny

> **ny**: `number`

Defined in: [elements/physics/colliders/SurfaceCollider.ts:57](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/colliders/SurfaceCollider.ts#L57)

Células em y (1 no modo altura).

***

### nz

> **nz**: `number`

Defined in: [elements/physics/colliders/SurfaceCollider.ts:59](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/colliders/SurfaceCollider.ts#L59)

Células em z.
