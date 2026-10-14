[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / RigidBodyRawOptions

# Interface: RigidBodyRawOptions

Defined in: [elements/physics/bodies/RigidBody.ts:59](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/physics/bodies/RigidBody.ts#L59)

Opções cruas (avançado) — fornece `schema` + `data` diretamente, como antes.
Mantida para retrocompatibilidade e tuning de baixo nível.

## Properties

### data?

> `readonly` `optional` **data?**: `Record`\<`string`, `unknown`\>

Defined in: [elements/physics/bodies/RigidBody.ts:63](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/physics/bodies/RigidBody.ts#L63)

Dado cru do struct (campos do schema); ausentes recebem default.

***

### schema

> `readonly` **schema**: `StructSchema`

Defined in: [elements/physics/bodies/RigidBody.ts:61](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/physics/bodies/RigidBody.ts#L61)

Schema do struct do corpo (layout de GPU) — define o algoritmo pelo nome do pool.
