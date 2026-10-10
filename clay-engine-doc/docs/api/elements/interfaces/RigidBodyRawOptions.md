[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / RigidBodyRawOptions

# Interface: RigidBodyRawOptions

Defined in: [elements/physics/bodies/RigidBody.ts:54](https://github.com/dantasgut/clayflow/blob/1e865e5867462e68c307a6f63f28da7ac030edf9/src/elements/physics/bodies/RigidBody.ts#L54)

Opções cruas (avançado) — fornece `schema` + `data` diretamente, como antes.
Mantida para retrocompatibilidade e tuning de baixo nível.

## Properties

### data?

> `readonly` `optional` **data?**: `Record`\<`string`, `unknown`\>

Defined in: [elements/physics/bodies/RigidBody.ts:58](https://github.com/dantasgut/clayflow/blob/1e865e5867462e68c307a6f63f28da7ac030edf9/src/elements/physics/bodies/RigidBody.ts#L58)

Dado cru do struct (campos do schema); ausentes recebem default.

***

### schema

> `readonly` **schema**: `StructSchema`

Defined in: [elements/physics/bodies/RigidBody.ts:56](https://github.com/dantasgut/clayflow/blob/1e865e5867462e68c307a6f63f28da7ac030edf9/src/elements/physics/bodies/RigidBody.ts#L56)

Schema do struct do corpo (layout de GPU) — define o algoritmo pelo nome do pool.
