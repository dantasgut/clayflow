[**webgpu-engine**](../README.md)

***

[webgpu-engine](../README.md) / GPUSpringMassSolver

# Class: GPUSpringMassSolver

Defined in: [elements/physics/solvers/GPUSpringMassSolver.ts:9](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/elements/physics/solvers/GPUSpringMassSolver.ts#L9)

Solver GPU para corpos deformáveis (spring-mass via Compute Shader).
Implementa o lado "Implementação" do padrão Bridge.

## Implements

- [`PhysicsSolver`](../interfaces/PhysicsSolver.md)

## Constructors

### Constructor

> **new GPUSpringMassSolver**(`compute`): `GPUSpringMassSolver`

Defined in: [elements/physics/solvers/GPUSpringMassSolver.ts:14](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/elements/physics/solvers/GPUSpringMassSolver.ts#L14)

#### Parameters

##### compute

`ComputeManager`

#### Returns

`GPUSpringMassSolver`

## Properties

### id

> `readonly` **id**: `"gpu_spring_mass"` = `'gpu_spring_mass'`

Defined in: [elements/physics/solvers/GPUSpringMassSolver.ts:10](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/elements/physics/solvers/GPUSpringMassSolver.ts#L10)

Identificador único do solver para logging e profiling.

#### Implementation of

[`PhysicsSolver`](../interfaces/PhysicsSolver.md).[`id`](../interfaces/PhysicsSolver.md#id)

## Methods

### solve()

> **solve**(`body`, `_dt`): `void`

Defined in: [elements/physics/solvers/GPUSpringMassSolver.ts:18](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/elements/physics/solvers/GPUSpringMassSolver.ts#L18)

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
