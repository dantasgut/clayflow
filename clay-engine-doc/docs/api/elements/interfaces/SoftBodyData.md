[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / SoftBodyData

# Interface: SoftBodyData

Defined in: [src/elements/physics/bodies/SoftBody.ts:96](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/SoftBody.ts#L96)

Dado de um `SoftBody`: as partículas e as arestas por campo.

## Extends

- [`ParticleBodyData`](ParticleBodyData.md)

## Properties

### body

> **body**: [`ParticleFields`](../type-aliases/ParticleFields.md)

Defined in: [src/elements/physics/bodies/ParticleBody.ts:12](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/ParticleBody.ts#L12)

Partículas por campo.

#### Inherited from

[`ParticleBodyData`](ParticleBodyData.md).[`body`](ParticleBodyData.md#body)

***

### chunks?

> `optional` **chunks?**: [`ParticleFields`](../type-aliases/ParticleFields.md)

Defined in: [src/elements/physics/bodies/SoftBody.ts:102](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/SoftBody.ts#L102)

Os blocos da energia (`SoftBodyChunk`: a faixa, resolvida pela C2, e o índice de cada um).

***

### edges?

> `optional` **edges?**: [`ParticleFields`](../type-aliases/ParticleFields.md)

Defined in: [src/elements/physics/bodies/SoftBody.ts:98](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/SoftBody.ts#L98)

Arestas no layout de `DistanceConstraint` (`i`/`j` locais, resolvidos pela C2 na faixa do corpo).

***

### range?

> `optional` **range?**: [`ParticleFields`](../type-aliases/ParticleFields.md)

Defined in: [src/elements/physics/bodies/SoftBody.ts:100](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/SoftBody.ts#L100)

A faixa do corpo para a série de energia (`SoftBodyRange`; inícios locais, resolvidos pela C2).
