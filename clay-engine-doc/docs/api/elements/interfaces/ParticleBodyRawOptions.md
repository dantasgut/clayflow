[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ParticleBodyRawOptions

# Interface: ParticleBodyRawOptions

Defined in: [elements/physics/bodies/ParticleBody.ts:16](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/bodies/ParticleBody.ts#L16)

Opções cruas de um corpo de partículas: schema do struct de GPU, contagem e dado por campo.

## Properties

### count

> `readonly` **count**: `number`

Defined in: [elements/physics/bodies/ParticleBody.ts:20](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/bodies/ParticleBody.ts#L20)

Número de partículas.

***

### data?

> `readonly` `optional` **data?**: [`ParticleFields`](../type-aliases/ParticleFields.md)

Defined in: [elements/physics/bodies/ParticleBody.ts:22](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/bodies/ParticleBody.ts#L22)

Dado por campo do schema (`fieldElements(tipo)` números por partícula); campos ausentes ficam com zero.

***

### schema

> `readonly` **schema**: `StructSchema`

Defined in: [elements/physics/bodies/ParticleBody.ts:18](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/bodies/ParticleBody.ts#L18)

Schema do struct da partícula (layout de GPU) — define o pool e o estágio que simula.
