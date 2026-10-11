[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SoftBodyRawOptions

# Interface: SoftBodyRawOptions

Defined in: [elements/physics/bodies/SoftBody.ts:31](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/elements/physics/bodies/SoftBody.ts#L31)

Opções cruas do SoftBody: schema do struct de GPU e dado do struct.

## Properties

### data?

> `readonly` `optional` **data?**: `Record`\<`string`, `unknown`\>

Defined in: [elements/physics/bodies/SoftBody.ts:35](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/elements/physics/bodies/SoftBody.ts#L35)

Dado cru do struct (campos do schema); ausentes recebem default.

***

### schema

> `readonly` **schema**: `StructSchema`

Defined in: [elements/physics/bodies/SoftBody.ts:33](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/elements/physics/bodies/SoftBody.ts#L33)

Schema do struct da partícula (layout de GPU) — define o algoritmo pelo nome do pool.
