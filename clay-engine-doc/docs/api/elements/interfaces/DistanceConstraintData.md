[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / DistanceConstraintData

# Interface: DistanceConstraintData

Defined in: [elements/physics/constraints/DistanceConstraint.ts:16](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/physics/constraints/DistanceConstraint.ts#L16)

Dado de um `DistanceConstraint` (layout de `DistanceConstraint.schema`; `i`/`j` resolvidos pela C2).

## Properties

### compliance

> **compliance**: `number`

Defined in: [elements/physics/constraints/DistanceConstraint.ts:24](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/physics/constraints/DistanceConstraint.ts#L24)

Compliance (m/N; 0 = rígida).

***

### i

> **i**: [`ParticleRef`](ParticleRef.md)

Defined in: [elements/physics/constraints/DistanceConstraint.ts:18](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/physics/constraints/DistanceConstraint.ts#L18)

Primeira partícula (slot resolvido pela C2).

***

### j

> **j**: [`ParticleRef`](ParticleRef.md)

Defined in: [elements/physics/constraints/DistanceConstraint.ts:20](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/physics/constraints/DistanceConstraint.ts#L20)

Segunda partícula (slot resolvido pela C2).

***

### rest\_length

> **rest\_length**: `number`

Defined in: [elements/physics/constraints/DistanceConstraint.ts:22](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/physics/constraints/DistanceConstraint.ts#L22)

Comprimento de repouso.
