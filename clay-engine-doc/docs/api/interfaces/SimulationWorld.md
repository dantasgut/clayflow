# Abstract Interface: SimulationWorld

Defined in: [scene/systems/SimulationWorld.ts:24](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/systems/SimulationWorld.ts#L24)

Contrato abstrato de um mundo de simulação física.

Não faz suposições sobre algoritmo de simulação, broadphase ou espaço.
Registro de corpos é event-driven via connectScene/disconnectScene.

Implementações concretas:
  - `PhysicsWorld`            — configurador de mundo, registro de forças globais.
  - `GpuPhysicsOrchestrator`  — orquestrador GPU-only via PhysicsComputePass.

## Example

```ts
const world = new GpuPhysicsOrchestrator(config, registry, eventBus, loader);
world.connectScene(scene);
// No loop de render:
world.step(scene, dt);
```

## Extended by

- [`GpuPhysicsOrchestrator`](../classes/GpuPhysicsOrchestrator.md)
- [`PhysicsWorld`](../classes/PhysicsWorld.md)

## Methods

### addForce()

> `abstract` **addForce**(`force`): `void`

Defined in: [scene/systems/SimulationWorld.ts:51](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/systems/SimulationWorld.ts#L51)

Registra uma força global aplicada a todos os corpos a cada step.

#### Parameters

##### force

[`Force`](Force.md)

#### Returns

`void`

***

### connectScene()

> `abstract` **connectScene**(`scene`): `void`

Defined in: [scene/systems/SimulationWorld.ts:34](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/systems/SimulationWorld.ts#L34)

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

Defined in: [scene/systems/SimulationWorld.ts:37](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/systems/SimulationWorld.ts#L37)

Remove a observação da cena e limpa todos os registros.

#### Parameters

##### scene

[`Entity`](../classes/Entity.md)

#### Returns

`void`

***

### encodeSyncPasses()?

> `optional` **encodeSyncPasses**(`commandEncoder`, `entityIdToSlot`, `objectUboBuffer`): `void`

Defined in: [scene/systems/SimulationWorld.ts:78](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/systems/SimulationWorld.ts#L78)

Opcional — despachado pelo renderer APÓS uploadObjectMatrices e ANTES do render pass.
Permite que passes GPU escrevam diretamente no UBO de modelo, sem CPU readback.
Implementado por `GpuPhysicsOrchestrator`; no-op em `PhysicsWorld`.

#### Parameters

##### commandEncoder

`GPUCommandEncoder`

##### entityIdToSlot

`Map`\<`number`, `number`\>

##### objectUboBuffer

`GPUBuffer`

#### Returns

`void`

***

### initializeResources()?

> `optional` **initializeResources**(`resourceManager`): `void`

Defined in: [scene/systems/SimulationWorld.ts:71](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/systems/SimulationWorld.ts#L71)

Opcional — chamado pelo renderer uma vez, após a inicialização do engine GPU
(dentro de `initGPUResources`), antes do primeiro `step()`.
Injeta o `ResourceManager` para que o mundo possa alocar buffers globais
sem acessar o singleton `WebGPUEngineCore` diretamente.
Implementado por `GpuPhysicsOrchestrator`; no-op em mundos puramente CPU.

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`void`

***

### removeForce()

> `abstract` **removeForce**(`id`): `void`

Defined in: [scene/systems/SimulationWorld.ts:52](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/systems/SimulationWorld.ts#L52)

#### Parameters

##### id

`string`

#### Returns

`void`

***

### removeSolver()

> `abstract` **removeSolver**(`physicType`): `void`

Defined in: [scene/systems/SimulationWorld.ts:48](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/systems/SimulationWorld.ts#L48)

#### Parameters

##### physicType

`string`

#### Returns

`void`

***

### setSolver()

> `abstract` **setSolver**(`physicType`, `solver`): `void`

Defined in: [scene/systems/SimulationWorld.ts:47](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/systems/SimulationWorld.ts#L47)

Associa um solver ao tipo de corpo (estratégia por physicType).
Em modo GPU-only, implementações podem tratar este método como no-op.

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

Defined in: [scene/systems/SimulationWorld.ts:62](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/systems/SimulationWorld.ts#L62)

Avança a simulação por `dt` segundos.
A implementação decide o pipeline interno (broadphase, narrowphase, integração).

#### Parameters

##### scene

[`Entity`](../classes/Entity.md)

##### dt

`number`

#### Returns

`void`
