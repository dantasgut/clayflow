[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / RigidBodyRawOptions

# Interface: RigidBodyRawOptions

Defined in: [elements/physics/bodies/RigidBody.ts:59](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/bodies/RigidBody.ts#L59)

Opções cruas (avançado) — fornece `schema` + `data` diretamente, como antes.
Mantida para retrocompatibilidade e tuning de baixo nível.

## Properties

### data?

> `readonly` `optional` **data?**: `Record`\<`string`, `unknown`\>

Defined in: [elements/physics/bodies/RigidBody.ts:63](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/bodies/RigidBody.ts#L63)

Dado cru do struct (campos do schema); ausentes recebem default.

***

### schema

> `readonly` **schema**: `StructSchema`

Defined in: [elements/physics/bodies/RigidBody.ts:61](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/bodies/RigidBody.ts#L61)

Schema do struct do corpo (layout de GPU) — define o algoritmo pelo nome do pool.
