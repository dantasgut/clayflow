[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / DistanceConstraintValues

# Interface: DistanceConstraintValues

Defined in: [src/elements/physics/constraints/DistanceConstraint.ts:40](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/constraints/DistanceConstraint.ts#L40)

Valores do construtor do `DistanceConstraint`.

## Properties

### a

> `readonly` **a**: [`ParticleRef`](ParticleRef.md)

Defined in: [src/elements/physics/constraints/DistanceConstraint.ts:42](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/constraints/DistanceConstraint.ts#L42)

Primeira partícula.

***

### b

> `readonly` **b**: [`ParticleRef`](ParticleRef.md)

Defined in: [src/elements/physics/constraints/DistanceConstraint.ts:44](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/constraints/DistanceConstraint.ts#L44)

Segunda partícula.

***

### compliance?

> `readonly` `optional` **compliance?**: `number`

Defined in: [src/elements/physics/constraints/DistanceConstraint.ts:48](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/constraints/DistanceConstraint.ts#L48)

Compliance (m/N; 0 = rígida). Default 0.

***

### restLength?

> `readonly` `optional` **restLength?**: `number`

Defined in: [src/elements/physics/constraints/DistanceConstraint.ts:46](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/constraints/DistanceConstraint.ts#L46)

Comprimento de repouso (m). Default 1.
