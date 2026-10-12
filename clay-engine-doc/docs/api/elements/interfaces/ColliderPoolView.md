[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ColliderPoolView

# Interface: ColliderPoolView

Defined in: [elements/physics/colliders/ColliderSet.ts:38](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/colliders/ColliderSet.ts#L38)

Visão de um pool de collider: buffer do pool, mapa de dono e contagem.

## Properties

### buffer

> `readonly` **buffer**: `PoolBufferSpec`

Defined in: [elements/physics/colliders/ColliderSet.ts:40](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/colliders/ColliderSet.ts#L40)

Pool tipado (ou buffer mínimo se o pool não existe).

***

### count

> `readonly` **count**: `number`

Defined in: [elements/physics/colliders/ColliderSet.ts:44](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/colliders/ColliderSet.ts#L44)

Colliders no pool.

***

### owners

> `readonly` **owners**: `StorageBufferSpec`

Defined in: [elements/physics/colliders/ColliderSet.ts:42](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/colliders/ColliderSet.ts#L42)

`owners[slot]` = slot do corpo dono no pool de corpos, ou `NO_OWNER`.
