[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / RigidBodyRawOptions

# Interface: RigidBodyRawOptions

Defined in: [elements/physics/bodies/RigidBody.ts:59](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/physics/bodies/RigidBody.ts#L59)

Opções cruas (avançado) — fornece `schema` + `data` diretamente, como antes.
Mantida para retrocompatibilidade e tuning de baixo nível.

## Properties

### data?

> `readonly` `optional` **data?**: `Record`\<`string`, `unknown`\>

Defined in: [elements/physics/bodies/RigidBody.ts:63](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/physics/bodies/RigidBody.ts#L63)

Dado cru do struct (campos do schema); ausentes recebem default.

***

### schema

> `readonly` **schema**: `StructSchema`

Defined in: [elements/physics/bodies/RigidBody.ts:61](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/physics/bodies/RigidBody.ts#L61)

Schema do struct do corpo (layout de GPU) — define o algoritmo pelo nome do pool.
