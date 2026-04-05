# Class: GPUSpringMassSolver

Defined in: [elements/physics/solvers/GPUSpringMassSolver.ts:9](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/elements/physics/solvers/GPUSpringMassSolver.ts#L9)

Solver GPU para corpos deformáveis (spring-mass via Compute Shader).
Implementa o lado "Implementação" do padrão Bridge.

## Implements

- [`PhysicsSolver`](../interfaces/PhysicsSolver.md)

## Constructors

### Constructor

> **new GPUSpringMassSolver**(`compute`): `GPUSpringMassSolver`

Defined in: [elements/physics/solvers/GPUSpringMassSolver.ts:14](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/elements/physics/solvers/GPUSpringMassSolver.ts#L14)

#### Parameters

##### compute

`ComputeManager`

#### Returns

`GPUSpringMassSolver`

## Properties

### id

> `readonly` **id**: `"gpu_spring_mass"` = `'gpu_spring_mass'`

Defined in: [elements/physics/solvers/GPUSpringMassSolver.ts:10](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/elements/physics/solvers/GPUSpringMassSolver.ts#L10)

Identificador único do solver para logging e profiling.

#### Implementation of

[`PhysicsSolver`](../interfaces/PhysicsSolver.md).[`id`](../interfaces/PhysicsSolver.md#id)

## Methods

### solve()

> **solve**(`body`, `_dt`): `void`

Defined in: [elements/physics/solvers/GPUSpringMassSolver.ts:18](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/elements/physics/solvers/GPUSpringMassSolver.ts#L18)

Avança a simulação do corpo por um passo de tempo.

#### Parameters

##### body

[`PhysicsBody`](PhysicsBody.md)

Corpo a simular

##### \_dt

`number`

#### Returns

`void`

#### Implementation of

[`PhysicsSolver`](../interfaces/PhysicsSolver.md).[`solve`](../interfaces/PhysicsSolver.md#solve)
