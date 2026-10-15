[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ColliderPoolView

# Interface: ColliderPoolView

Defined in: [elements/physics/colliders/ColliderSet.ts:62](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/colliders/ColliderSet.ts#L62)

Visão de um pool de collider: buffer do pool, mapa de dono e contagem.

## Properties

### buffer

> `readonly` **buffer**: `StorageBufferSpec`

Defined in: [elements/physics/colliders/ColliderSet.ts:64](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/colliders/ColliderSet.ts#L64)

Pool tipado (ou buffer mínimo se o pool não existe).

***

### count

> `readonly` **count**: `number`

Defined in: [elements/physics/colliders/ColliderSet.ts:68](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/colliders/ColliderSet.ts#L68)

Colliders no pool.

***

### owners

> `readonly` **owners**: `StorageBufferSpec`

Defined in: [elements/physics/colliders/ColliderSet.ts:66](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/colliders/ColliderSet.ts#L66)

`owners[slot]` = slot do corpo dono no pool de corpos, ou `NO_OWNER`.
