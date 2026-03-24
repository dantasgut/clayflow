# Class: XPBDSoftBodySolver

Defined in: [elements/physics/solvers/XPBDSoftBodySolver.ts:24](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/solvers/XPBDSoftBodySolver.ts#L24)

Solver XPBD para corpos deformáveis.

Segue o mesmo padrão do CPURigidBodySolver: é invocado pelo ForceStage
após o acúmulo de `netForce`. Lê `netForce` do property bag do corpo e
aplica a aceleração resultante à velocidade de cada partícula.

Integração:
  a  = netForce / mass          (aceleração uniforme do corpo)
  vᵢ += a · dt                  (para cada partícula não fixada)

Forças globais (gravidade, vento) chegam aqui via world.addForce(),
exatamente como no pipeline de RigidBody — sem duplicação de parâmetros.

## Example

```ts
world.addForce(new ConstantForce('gravity', vec3.fromValues(0, -9.81, 0)));
world.setSolver('SoftBody', new XPBDSoftBodySolver());
```

## Implements

- [`PhysicsSolver`](../interfaces/PhysicsSolver.md)

## Constructors

### Constructor

> **new XPBDSoftBodySolver**(): `XPBDSoftBodySolver`

#### Returns

`XPBDSoftBodySolver`

## Properties

### id

> `readonly` **id**: `"xpbd_soft_body"` = `'xpbd_soft_body'`

Defined in: [elements/physics/solvers/XPBDSoftBodySolver.ts:25](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/solvers/XPBDSoftBodySolver.ts#L25)

Identificador único do solver para logging e profiling.

#### Implementation of

[`PhysicsSolver`](../interfaces/PhysicsSolver.md).[`id`](../interfaces/PhysicsSolver.md#id)

## Methods

### solve()

> **solve**(`body`, `dt`): `void`

Defined in: [elements/physics/solvers/XPBDSoftBodySolver.ts:27](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/solvers/XPBDSoftBodySolver.ts#L27)

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
