# Class: PhysicsWorld

Defined in: [elements/physics/PhysicsWorld.ts:44](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/PhysicsWorld.ts#L44)

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

## Extends

- [`SimulationWorld`](../interfaces/SimulationWorld.md)

## Constructors

### Constructor

> **new PhysicsWorld**(`config?`): `PhysicsWorld`

Defined in: [elements/physics/PhysicsWorld.ts:52](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/PhysicsWorld.ts#L52)

#### Parameters

##### config?

[`PhysicsSceneConfig`](../interfaces/PhysicsSceneConfig.md) = `{}`

#### Returns

`PhysicsWorld`

#### Overrides

`SimulationWorld.constructor`

## Accessors

### eventBus

#### Get Signature

> **get** **eventBus**(): [`GpuPipelineEventBus`](../interfaces/GpuPipelineEventBus.md)

Defined in: [elements/physics/PhysicsWorld.ts:50](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/PhysicsWorld.ts#L50)

Barramento de eventos — exposto para integração com o renderer.

##### Returns

[`GpuPipelineEventBus`](../interfaces/GpuPipelineEventBus.md)

## Methods

### addForce()

> **addForce**(`force`): `void`

Defined in: [elements/physics/PhysicsWorld.ts:91](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/PhysicsWorld.ts#L91)

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

Defined in: [elements/physics/PhysicsWorld.ts:65](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/PhysicsWorld.ts#L65)

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

Defined in: [elements/physics/PhysicsWorld.ts:69](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/PhysicsWorld.ts#L69)

Remove a observação da cena e limpa todos os registros.

#### Parameters

##### scene

[`Entity`](Entity.md)

#### Returns

`void`

#### Overrides

[`SimulationWorld`](../interfaces/SimulationWorld.md).[`disconnectScene`](../interfaces/SimulationWorld.md#disconnectscene)

***

### encodeSyncPasses()

> **encodeSyncPasses**(`commandEncoder`, `entityIdToSlot`, `objectUboBuffer`): `void`

Defined in: [elements/physics/PhysicsWorld.ts:81](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/PhysicsWorld.ts#L81)

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

#### Overrides

[`SimulationWorld`](../interfaces/SimulationWorld.md).[`encodeSyncPasses`](../interfaces/SimulationWorld.md#encodesyncpasses)

***

### initializeResources()

> **initializeResources**(`resourceManager`): `void`

Defined in: [elements/physics/PhysicsWorld.ts:59](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/PhysicsWorld.ts#L59)

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

#### Overrides

[`SimulationWorld`](../interfaces/SimulationWorld.md).[`initializeResources`](../interfaces/SimulationWorld.md#initializeresources)

***

### removeForce()

> **removeForce**(`id`): `void`

Defined in: [elements/physics/PhysicsWorld.ts:95](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/PhysicsWorld.ts#L95)

#### Parameters

##### id

`string`

#### Returns

`void`

#### Overrides

[`SimulationWorld`](../interfaces/SimulationWorld.md).[`removeForce`](../interfaces/SimulationWorld.md#removeforce)

***

### removeSolver()

> **removeSolver**(`_physicType`): `void`

Defined in: [elements/physics/PhysicsWorld.ts:104](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/PhysicsWorld.ts#L104)

#### Parameters

##### \_physicType

`string`

#### Returns

`void`

#### Overrides

[`SimulationWorld`](../interfaces/SimulationWorld.md).[`removeSolver`](../interfaces/SimulationWorld.md#removesolver)

***

### setSolver()

> **setSolver**(`_physicType`, `_solver`): `void`

Defined in: [elements/physics/PhysicsWorld.ts:100](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/PhysicsWorld.ts#L100)

No-op — engine GPU-only não usa solvers CPU.

#### Parameters

##### \_physicType

`string`

##### \_solver

[`PhysicsSolver`](../interfaces/PhysicsSolver.md)

#### Returns

`void`

#### Overrides

[`SimulationWorld`](../interfaces/SimulationWorld.md).[`setSolver`](../interfaces/SimulationWorld.md#setsolver)

***

### step()

> **step**(`scene`, `dt`): `void`

Defined in: [elements/physics/PhysicsWorld.ts:75](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/PhysicsWorld.ts#L75)

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
