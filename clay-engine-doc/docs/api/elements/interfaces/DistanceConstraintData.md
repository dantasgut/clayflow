[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / DistanceConstraintData

# Interface: DistanceConstraintData

Defined in: [src/elements/physics/constraints/DistanceConstraint.ts:16](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/constraints/DistanceConstraint.ts#L16)

Dado de um `DistanceConstraint` (layout de `DistanceConstraint.schema`; `i`/`j` resolvidos pela C2).

## Properties

### color

> **color**: `number`

Defined in: [src/elements/physics/constraints/DistanceConstraint.ts:29](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/constraints/DistanceConstraint.ts#L29)

Cor da restrição (spec 034, T061b): as da mesma cor não compartilham partícula e são resolvidas em paralelo; a
`XPBD_SERIAL_COLOR`, uma a uma.

***

### compliance

> **compliance**: `number`

Defined in: [src/elements/physics/constraints/DistanceConstraint.ts:24](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/constraints/DistanceConstraint.ts#L24)

Compliance (m/N; 0 = rígida).

***

### i

> **i**: [`ParticleRef`](ParticleRef.md)

Defined in: [src/elements/physics/constraints/DistanceConstraint.ts:18](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/constraints/DistanceConstraint.ts#L18)

Primeira partícula (slot resolvido pela C2).

***

### j

> **j**: [`ParticleRef`](ParticleRef.md)

Defined in: [src/elements/physics/constraints/DistanceConstraint.ts:20](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/constraints/DistanceConstraint.ts#L20)

Segunda partícula (slot resolvido pela C2).

***

### rest\_length

> **rest\_length**: `number`

Defined in: [src/elements/physics/constraints/DistanceConstraint.ts:22](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/constraints/DistanceConstraint.ts#L22)

Comprimento de repouso.
