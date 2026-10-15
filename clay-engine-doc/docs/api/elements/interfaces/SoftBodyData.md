[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SoftBodyData

# Interface: SoftBodyData

Defined in: [elements/physics/bodies/SoftBody.ts:80](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/bodies/SoftBody.ts#L80)

Dado de um `SoftBody`: as partículas e as arestas por campo.

## Extends

- [`ParticleBodyData`](ParticleBodyData.md)

## Properties

### body

> **body**: [`ParticleFields`](../type-aliases/ParticleFields.md)

Defined in: [elements/physics/bodies/ParticleBody.ts:12](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/bodies/ParticleBody.ts#L12)

Partículas por campo.

#### Inherited from

[`ParticleBodyData`](ParticleBodyData.md).[`body`](ParticleBodyData.md#body)

***

### edges?

> `optional` **edges?**: [`ParticleFields`](../type-aliases/ParticleFields.md)

Defined in: [elements/physics/bodies/SoftBody.ts:82](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/bodies/SoftBody.ts#L82)

Arestas no layout de `DistanceConstraint` (`i`/`j` locais, resolvidos pela C2 na faixa do corpo).
