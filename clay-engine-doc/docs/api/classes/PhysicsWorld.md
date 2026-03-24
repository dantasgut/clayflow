[**webgpu-engine**](../README.md)

***

[webgpu-engine](../README.md) / PhysicsWorld

# Class: PhysicsWorld

Defined in: [elements/physics/PhysicsWorld.ts:135](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/elements/physics/PhysicsWorld.ts#L135)

Implementação euclidiana do SimulationWorld (Mediator — GoF).

Orquestra o pipeline de física composto por estágios independentes
(Pipeline pattern). Cada estágio encapsula uma fase única da simulação.

═══════════════════════════════════════════════════════════════════════════
PIPELINE DE FÍSICA — executado a cada frame em `step(scene, dt)`
═══════════════════════════════════════════════════════════════════════════

O frame dt é dividido em N substeps (padrão: 8) para estabilidade numérica.
O pipeline de substeps roda N vezes; SyncStage roda uma única vez ao final.

 ┌─ loop substeps (N × substepDt) ──────────────────────────────────────┐
 │                                                                       │
 │  1. ForceStage          Acumula forças globais (gravidade, etc.) e   │
 │                         executa o solver: netForce → velocity,        │
 │                         aplica linearDamping e angularDamping.        │
 │                                                                       │
 │  2. BroadphaseStage     Sincroniza worldMatrix dos corpos com suas   │
 │                         posições físicas atuais; detecta pares de    │
 │                         colisores com AABBs sobrepostas (O(n²)).     │
 │                                                                       │
 │  3. NarrowphaseStage    Testa pares candidatos com o algoritmo       │
 │                         exato para cada par de formas (dispatcher);  │
 │                         gera CollisionContacts com normal, depth,    │
 │                         pontos de contato e weight = 1/N.            │
 │                                                                       │
 │  4. CollisionResolutionStage                                         │
 │                         Aplica impulso normal (restituição) e        │
 │                         tangencial (atrito de Coulomb) em cada       │
 │                         contato; corrige posição (depenetração).     │
 │                                                                       │
 │  5. IntegrationStage    Integra velocity → position (Euler) e       │
 │                         angularVelocity → rotation (quaternion).     │
 │                                                                       │
 │  6. SleepStage          Coloca em sono corpos cujas velocidades      │
 │                         ficaram abaixo dos limiares por tempo        │
 │                         suficiente; elimina micro-impulsos residuais. │
 │                                                                       │
 └───────────────────────────────────────────────────────────────────────┘

 7. SyncStage (1× por frame)
                        Copia body.position/rotation → Transform visual,
                        tornando o resultado visível ao renderer.

═══════════════════════════════════════════════════════════════════════════
REGISTRO EVENT-DRIVEN
═══════════════════════════════════════════════════════════════════════════

Modificações no grafo de cena (addChild / removeChild) durante step() são
diferidas em filas (`pendingAdd`, `pendingRemove`) e processadas no início
do próximo frame — evitando mutação de coleções durante a iteração do pipeline.

## Example

```ts
const world = new PhysicsWorld();
world.setSolver('RigidBody', new CPURigidBodySolver());
world.addForce(new ConstantForce('gravity', vec3.fromValues(0, -9.81, 0)));
world.setSubsteps(8);

// No loop de render:
world.step(scene, dt);
```

## Extends

- [`SimulationWorld`](../interfaces/SimulationWorld.md)

## Constructors

### Constructor

> **new PhysicsWorld**(`options?`): `PhysicsWorld`

Defined in: [elements/physics/PhysicsWorld.ts:163](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/elements/physics/PhysicsWorld.ts#L163)

#### Parameters

##### options?

[`PhysicsWorldOptions`](../interfaces/PhysicsWorldOptions.md) = `{}`

#### Returns

`PhysicsWorld`

#### Overrides

`SimulationWorld.constructor`

## Accessors

### dispatcher

#### Get Signature

> **get** **dispatcher**(): `CollisionDispatcher`

Defined in: [elements/physics/PhysicsWorld.ts:244](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/elements/physics/PhysicsWorld.ts#L244)

##### Returns

`CollisionDispatcher`

## Methods

### addForce()

> **addForce**(`force`): `void`

Defined in: [elements/physics/PhysicsWorld.ts:292](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/elements/physics/PhysicsWorld.ts#L292)

Registra uma força global aplicada a todos os corpos a cada step.

#### Parameters

##### force

[`Force`](../interfaces/Force.md)

#### Returns

`void`

#### Overrides

[`SimulationWorld`](../interfaces/SimulationWorld.md).[`addForce`](../interfaces/SimulationWorld.md#addforce)

***

### connectScene()

> **connectScene**(`scene`): `void`

Defined in: [elements/physics/PhysicsWorld.ts:259](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/elements/physics/PhysicsWorld.ts#L259)

Conecta o mundo a uma cena: observa child_added e child_removed
para registrar/remover corpos e colliders automaticamente.
Também registra todos os physics components já presentes na cena.

#### Parameters

##### scene

[`Entity`](Entity.md)

#### Returns

`void`

#### Overrides

[`SimulationWorld`](../interfaces/SimulationWorld.md).[`connectScene`](../interfaces/SimulationWorld.md#connectscene)

***

### disconnectScene()

> **disconnectScene**(`scene`): `void`

Defined in: [elements/physics/PhysicsWorld.ts:270](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/elements/physics/PhysicsWorld.ts#L270)

Remove a observação da cena e limpa todos os registros.

#### Parameters

##### scene

[`Entity`](Entity.md)

#### Returns

`void`

#### Overrides

[`SimulationWorld`](../interfaces/SimulationWorld.md).[`disconnectScene`](../interfaces/SimulationWorld.md#disconnectscene)

***

### removeForce()

> **removeForce**(`id`): `void`

Defined in: [elements/physics/PhysicsWorld.ts:296](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/elements/physics/PhysicsWorld.ts#L296)

#### Parameters

##### id

`string`

#### Returns

`void`

#### Overrides

[`SimulationWorld`](../interfaces/SimulationWorld.md).[`removeForce`](../interfaces/SimulationWorld.md#removeforce)

***

### removeSolver()

> **removeSolver**(`physicType`): `void`

Defined in: [elements/physics/PhysicsWorld.ts:288](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/elements/physics/PhysicsWorld.ts#L288)

#### Parameters

##### physicType

`string`

#### Returns

`void`

#### Overrides

[`SimulationWorld`](../interfaces/SimulationWorld.md).[`removeSolver`](../interfaces/SimulationWorld.md#removesolver)

***

### setSolver()

> **setSolver**(`physicType`, `solver`): `void`

Defined in: [elements/physics/PhysicsWorld.ts:284](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/elements/physics/PhysicsWorld.ts#L284)

Associa um solver ao tipo de corpo (Bridge).

#### Parameters

##### physicType

`string`

##### solver

[`PhysicsSolver`](../interfaces/PhysicsSolver.md)

#### Returns

`void`

#### Overrides

[`SimulationWorld`](../interfaces/SimulationWorld.md).[`setSolver`](../interfaces/SimulationWorld.md#setsolver)

***

### setSubsteps()

> **setSubsteps**(`n`): `void`

Defined in: [elements/physics/PhysicsWorld.ts:248](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/elements/physics/PhysicsWorld.ts#L248)

#### Parameters

##### n

`number`

#### Returns

`void`

***

### step()

> **step**(`scene`, `dt`): `void`

Defined in: [elements/physics/PhysicsWorld.ts:304](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/elements/physics/PhysicsWorld.ts#L304)

Avança a simulação por `dt` segundos.
A implementação decide o pipeline interno (broadphase, narrowphase, integração).

#### Parameters

##### scene

[`Entity`](Entity.md)

##### dt

`number`

#### Returns

`void`

#### Overrides

[`SimulationWorld`](../interfaces/SimulationWorld.md).[`step`](../interfaces/SimulationWorld.md#step)
