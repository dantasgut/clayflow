# Class: CPURigidBodySolver

Defined in: [elements/physics/solvers/CPURigidBodySolver.ts:12](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/solvers/CPURigidBodySolver.ts#L12)

Solver CPU para corpos rígidos (integrador de Euler semi-implícito).
Lê propriedades via Property Bag — não depende de RigidBody concretamente.
Qualquer PhysicsBody com 'mass' e 'velocity' pode ser simulado por este solver.

Forças acumuladas pelo PhysicsWorld em 'netForce' são integradas aqui.

## Implements

- [`PhysicsSolver`](../interfaces/PhysicsSolver.md)

## Constructors

### Constructor

> **new CPURigidBodySolver**(): `CPURigidBodySolver`

#### Returns

`CPURigidBodySolver`

## Properties

### id

> `readonly` **id**: `"cpu_rigid_body"` = `'cpu_rigid_body'`

Defined in: [elements/physics/solvers/CPURigidBodySolver.ts:13](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/solvers/CPURigidBodySolver.ts#L13)

Identificador único do solver para logging e profiling.

#### Implementation of

[`PhysicsSolver`](../interfaces/PhysicsSolver.md).[`id`](../interfaces/PhysicsSolver.md#id)

## Methods

### solve()

> **solve**(`body`, `dt`): `void`

Defined in: [elements/physics/solvers/CPURigidBodySolver.ts:15](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/solvers/CPURigidBodySolver.ts#L15)

Avança a simulação do corpo por um passo de tempo.

#### Parameters

##### body

[`PhysicsBody`](PhysicsBody.md)

Corpo a simular

##### dt

`number`

Delta-time em segundos

#### Returns

`void`

#### Implementation of

[`PhysicsSolver`](../interfaces/PhysicsSolver.md).[`solve`](../interfaces/PhysicsSolver.md#solve)
