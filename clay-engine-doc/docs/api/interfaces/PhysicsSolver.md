# Interface: PhysicsSolver

Defined in: [scene/systems/solvers/PhysicsSolver.ts:15](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/systems/solvers/PhysicsSolver.ts#L15)

Abstração de backend de simulação física (Bridge — GoF).

Separa a definição do corpo (PhysicsBody = abstração)
do algoritmo de simulação (PhysicsSolver = implementação).
Novas estratégias de integração (PBD, Verlet, XPBD, CPU fallback)
podem ser introduzidas sem modificar nenhum corpo físico.

## Example

```ts
world.setSolver('RigidBody', new CPURigidBodySolver());
world.setSolver('SoftBody', new GPUSpringMassSolver(compute));
```

## Properties

### id

> `readonly` **id**: `string`

Defined in: [scene/systems/solvers/PhysicsSolver.ts:17](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/systems/solvers/PhysicsSolver.ts#L17)

Identificador único do solver para logging e profiling.

## Methods

### solve()

> **solve**(`body`, `dt`): `void`

Defined in: [scene/systems/solvers/PhysicsSolver.ts:24](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/systems/solvers/PhysicsSolver.ts#L24)

Avança a simulação do corpo por um passo de tempo.

#### Parameters

##### body

[`PhysicsBody`](../classes/PhysicsBody.md)

Corpo a simular

##### dt

`number`

Delta-time em segundos

#### Returns

`void`
