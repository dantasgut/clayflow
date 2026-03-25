# Abstract Interface: SimulationWorld

Defined in: [scene/systems/SimulationWorld.ts:25](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/SimulationWorld.ts#L25)

Contrato abstrato de um mundo de simulação física.

Não faz suposições sobre:
 - O espaço (euclidiano, hiperbólico, abstrato)
 - O algoritmo de broadphase
 - A ordem do pipeline de simulação
 - A natureza das forças ou colisores

Registro de corpos é event-driven via connectScene/disconnectScene —
não há registro manual por frame. O step avança a simulação e nada mais.

## Example

```ts
const world = new PhysicsWorld();
world.connectScene(scene);          // observa child_added / child_removed
// No loop de render:
world.step(encoder, dt);
```

## Extended by

- [`PhysicsWorld`](../classes/PhysicsWorld.md)

## Methods

### addForce()

> `abstract` **addForce**(`force`): `void`

Defined in: [scene/systems/SimulationWorld.ts:49](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/SimulationWorld.ts#L49)

Registra uma força global aplicada a todos os corpos a cada step.

#### Parameters

##### force

[`Force`](Force.md)

#### Returns

`void`

***

### connectScene()

> `abstract` **connectScene**(`scene`): `void`

Defined in: [scene/systems/SimulationWorld.ts:35](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/SimulationWorld.ts#L35)

Conecta o mundo a uma cena: observa child_added e child_removed
para registrar/remover corpos e colliders automaticamente.
Também registra todos os physics components já presentes na cena.

#### Parameters

##### scene

[`Entity`](../classes/Entity.md)

#### Returns

`void`

***

### disconnectScene()

> `abstract` **disconnectScene**(`scene`): `void`

Defined in: [scene/systems/SimulationWorld.ts:38](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/SimulationWorld.ts#L38)

Remove a observação da cena e limpa todos os registros.

#### Parameters

##### scene

[`Entity`](../classes/Entity.md)

#### Returns

`void`

***

### encodeSyncPasses()?

> `optional` **encodeSyncPasses**(`commandEncoder`, `entityIdToSlot`, `objectUboBuffer`): `void`

Defined in: [scene/systems/SimulationWorld.ts:73](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/SimulationWorld.ts#L73)

Opcional — despachado pelo renderer no seu próprio encoder, APÓS uploadObjectMatrices
e ANTES do render pass. Permite que pipelines GPU sobrescrevam os slots UBO dos
corpos simulados com matrizes calculadas na GPU, sem CPU readback.

Implementado apenas por mundos que possuem estágios GPU (ex: GpuRigidBodyPipeline).

#### Parameters

##### commandEncoder

`GPUCommandEncoder`

Encoder do renderer (sem render pass aberto).

##### entityIdToSlot

`Map`\<`number`, `number`\>

Mapa entityId → slot no UBO dinâmico de modelo.

##### objectUboBuffer

`GPUBuffer`

GPUBuffer do renderer_object_dyn_ubo (UNIFORM|STORAGE).

#### Returns

`void`

***

### removeForce()

> `abstract` **removeForce**(`id`): `void`

Defined in: [scene/systems/SimulationWorld.ts:50](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/SimulationWorld.ts#L50)

#### Parameters

##### id

`string`

#### Returns

`void`

***

### removeSolver()

> `abstract` **removeSolver**(`physicType`): `void`

Defined in: [scene/systems/SimulationWorld.ts:46](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/SimulationWorld.ts#L46)

#### Parameters

##### physicType

`string`

#### Returns

`void`

***

### setSolver()

> `abstract` **setSolver**(`physicType`, `solver`): `void`

Defined in: [scene/systems/SimulationWorld.ts:45](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/SimulationWorld.ts#L45)

Associa um solver ao tipo de corpo (Bridge).

#### Parameters

##### physicType

`string`

##### solver

[`PhysicsSolver`](PhysicsSolver.md)

#### Returns

`void`

***

### step()

> `abstract` **step**(`scene`, `dt`): `void`

Defined in: [scene/systems/SimulationWorld.ts:60](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/SimulationWorld.ts#L60)

Avança a simulação por `dt` segundos.
A implementação decide o pipeline interno (broadphase, narrowphase, integração).

#### Parameters

##### scene

[`Entity`](../classes/Entity.md)

##### dt

`number`

#### Returns

`void`
