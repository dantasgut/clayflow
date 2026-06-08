[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SoftBodyOptions

# Interface: SoftBodyOptions

Defined in: [elements/physics/bodies/SoftBody.ts:8](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/bodies/SoftBody.ts#L8)

Opções de criação do SoftBody.

## Properties

### data?

> `readonly` `optional` **data?**: `Record`\<`string`, `unknown`\>

Defined in: [elements/physics/bodies/SoftBody.ts:19](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/bodies/SoftBody.ts#L19)

Valores iniciais por field do schema. Fields ausentes recebem default
via `schema.applyDefaults`. Estrutura aceita está no schema.

***

### schema

> `readonly` **schema**: `StructSchema`

Defined in: [elements/physics/bodies/SoftBody.ts:14](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/bodies/SoftBody.ts#L14)

Schema que descreve o struct WGSL consumido pelo flow integrador.
Importado de `bodies/schemas/` (`XPBDSoftSchema`, `FEMSchema`,
`MPMSoftSchema`).
