[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SoftBodyRawOptions

# Interface: SoftBodyRawOptions

Defined in: [elements/physics/bodies/SoftBody.ts:36](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/physics/bodies/SoftBody.ts#L36)

Opções cruas do SoftBody: schema do struct de GPU e dado do struct.

## Properties

### data?

> `readonly` `optional` **data?**: `Record`\<`string`, `unknown`\>

Defined in: [elements/physics/bodies/SoftBody.ts:40](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/physics/bodies/SoftBody.ts#L40)

Dado cru do struct (campos do schema); ausentes recebem default.

***

### schema

> `readonly` **schema**: `StructSchema`

Defined in: [elements/physics/bodies/SoftBody.ts:38](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/physics/bodies/SoftBody.ts#L38)

Schema do struct da partícula (layout de GPU) — define o algoritmo pelo nome do pool.
