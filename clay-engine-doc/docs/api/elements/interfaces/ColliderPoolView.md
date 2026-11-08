[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / ColliderPoolView

# Interface: ColliderPoolView

Defined in: [src/elements/physics/colliders/ColliderSet.ts:50](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/colliders/ColliderSet.ts#L50)

Visão de um pool de collider: buffer do pool, mapa de dono e contagem.

## Properties

### buffer

> `readonly` **buffer**: [`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md)

Defined in: [src/elements/physics/colliders/ColliderSet.ts:52](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/colliders/ColliderSet.ts#L52)

Pool tipado (ou buffer mínimo se o pool não existe).

***

### count

> `readonly` **count**: `number`

Defined in: [src/elements/physics/colliders/ColliderSet.ts:56](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/colliders/ColliderSet.ts#L56)

Colliders no pool.

***

### owners

> `readonly` **owners**: [`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md)

Defined in: [src/elements/physics/colliders/ColliderSet.ts:54](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/colliders/ColliderSet.ts#L54)

`owners[slot]` = slot do corpo dono no pool de corpos, ou `NO_OWNER`.
