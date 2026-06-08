[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / FluidBodyOptions

# Interface: FluidBodyOptions

Defined in: [elements/physics/bodies/FluidBody.ts:8](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/bodies/FluidBody.ts#L8)

Opções de criação do FluidBody.

## Properties

### data?

> `readonly` `optional` **data?**: `Record`\<`string`, `unknown`\>

Defined in: [elements/physics/bodies/FluidBody.ts:19](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/bodies/FluidBody.ts#L19)

Valores iniciais por field do schema. Fields ausentes recebem default
via `schema.applyDefaults`. Estrutura aceita está no schema.

***

### schema

> `readonly` **schema**: `StructSchema`

Defined in: [elements/physics/bodies/FluidBody.ts:14](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/bodies/FluidBody.ts#L14)

Schema que descreve o struct WGSL consumido pelo flow integrador.
Importado de `bodies/schemas/` (`SPHSchema`, `PBFSchema`,
`MPMFluidSchema`).
