[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / FluidBodyRawOptions

# Interface: FluidBodyRawOptions

Defined in: [elements/physics/bodies/FluidBody.ts:35](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/physics/bodies/FluidBody.ts#L35)

Opções cruas do FluidBody: schema do struct de GPU e dado do struct.

## Properties

### data?

> `readonly` `optional` **data?**: `Record`\<`string`, `unknown`\>

Defined in: [elements/physics/bodies/FluidBody.ts:39](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/physics/bodies/FluidBody.ts#L39)

Dado cru do struct (campos do schema); ausentes recebem default.

***

### schema

> `readonly` **schema**: `StructSchema`

Defined in: [elements/physics/bodies/FluidBody.ts:37](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/physics/bodies/FluidBody.ts#L37)

Schema do struct da partícula (layout de GPU) — define o algoritmo pelo nome do pool.
