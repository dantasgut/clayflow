[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / RigidBodyOptions

# Interface: RigidBodyOptions

Defined in: [elements/physics/bodies/RigidBody.ts:8](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/bodies/RigidBody.ts#L8)

Opções de criação do RigidBody.

## Properties

### data?

> `readonly` `optional` **data?**: `Record`\<`string`, `unknown`\>

Defined in: [elements/physics/bodies/RigidBody.ts:18](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/bodies/RigidBody.ts#L18)

Valores iniciais por field do schema. Fields ausentes recebem default
via `schema.applyDefaults`. Estrutura aceita está no schema.

***

### schema

> `readonly` **schema**: `StructSchema`

Defined in: [elements/physics/bodies/RigidBody.ts:13](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/bodies/RigidBody.ts#L13)

Schema que descreve o struct WGSL consumido pelo flow integrador.
Importado de `bodies/schemas/` (`LCPSchema`, `XPBDRigidSchema`).
