[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / DistanceConstraintValues

# Interface: DistanceConstraintValues

Defined in: [elements/physics/constraints/DistanceConstraint.ts:28](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/physics/constraints/DistanceConstraint.ts#L28)

Valores do construtor do `DistanceConstraint`.

## Properties

### a

> `readonly` **a**: [`ParticleRef`](ParticleRef.md)

Defined in: [elements/physics/constraints/DistanceConstraint.ts:30](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/physics/constraints/DistanceConstraint.ts#L30)

Primeira partícula.

***

### b

> `readonly` **b**: [`ParticleRef`](ParticleRef.md)

Defined in: [elements/physics/constraints/DistanceConstraint.ts:32](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/physics/constraints/DistanceConstraint.ts#L32)

Segunda partícula.

***

### compliance?

> `readonly` `optional` **compliance?**: `number`

Defined in: [elements/physics/constraints/DistanceConstraint.ts:36](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/physics/constraints/DistanceConstraint.ts#L36)

Compliance (m/N; 0 = rígida). Default 0.

***

### restLength?

> `readonly` `optional` **restLength?**: `number`

Defined in: [elements/physics/constraints/DistanceConstraint.ts:34](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/physics/constraints/DistanceConstraint.ts#L34)

Comprimento de repouso (m). Default 1.
