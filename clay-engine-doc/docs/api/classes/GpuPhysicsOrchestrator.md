# Class: GpuPhysicsOrchestrator

Defined in: [scene/rendering/GpuPhysicsOrchestrator.ts:61](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/rendering/GpuPhysicsOrchestrator.ts#L61)

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

> **new GpuPhysicsOrchestrator**(`config`, `registry`, `eventBus?`, `resLoader?`, `globalForces?`): `GpuPhysicsOrchestrator`

Defined in: [scene/rendering/GpuPhysicsOrchestrator.ts:98](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/rendering/GpuPhysicsOrchestrator.ts#L98)

#### Parameters

##### config

[`PhysicsSceneConfig`](../interfaces/PhysicsSceneConfig.md)

##### registry

[`GpuComputePassRegistry`](GpuComputePassRegistry.md)

##### eventBus?

[`GpuPipelineEventBus`](../interfaces/GpuPipelineEventBus.md)

##### resLoader?

`PhysicsResourceLoader`\<`GpuPhysicsOrchestrator`\>

##### globalForces?

`Map`\<`string`, [`Force`](../interfaces/Force.md)\>

#### Returns

`GpuPhysicsOrchestrator`

#### Overrides

`SimulationWorld.constructor`

## Properties

### eventBus

> `readonly` **eventBus**: [`GpuPipelineEventBus`](../interfaces/GpuPipelineEventBus.md)

Defined in: [scene/rendering/GpuPhysicsOrchestrator.ts:65](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/rendering/GpuPhysicsOrchestrator.ts#L65)

Barramento de eventos — exposto para integração com o renderer.

## Methods

### addForce()

> **addForce**(`force`): `void`

Defined in: [scene/rendering/GpuPhysicsOrchestrator.ts:169](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/rendering/GpuPhysicsOrchestrator.ts#L169)

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

Defined in: [scene/rendering/GpuPhysicsOrchestrator.ts:134](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/rendering/GpuPhysicsOrchestrator.ts#L134)

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

Defined in: [scene/rendering/GpuPhysicsOrchestrator.ts:146](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/rendering/GpuPhysicsOrchestrator.ts#L146)

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

Defined in: [scene/rendering/GpuPhysicsOrchestrator.ts:211](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/rendering/GpuPhysicsOrchestrator.ts#L211)

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

### getContext()

> **getContext**(): `Readonly`\<[`GpuSimContext`](../interfaces/GpuSimContext.md)\>

Defined in: [scene/rendering/GpuPhysicsOrchestrator.ts:227](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/rendering/GpuPhysicsOrchestrator.ts#L227)

#### Returns

`Readonly`\<[`GpuSimContext`](../interfaces/GpuSimContext.md)\>

***

### getGlobalForces()

> **getGlobalForces**(): `ReadonlyMap`\<`string`, [`Force`](../interfaces/Force.md)\>

Defined in: [scene/rendering/GpuPhysicsOrchestrator.ts:231](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/rendering/GpuPhysicsOrchestrator.ts#L231)

#### Returns

`ReadonlyMap`\<`string`, [`Force`](../interfaces/Force.md)\>

***

### initializeResources()

> **initializeResources**(`resourceManager`): `void`

Defined in: [scene/rendering/GpuPhysicsOrchestrator.ts:126](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/rendering/GpuPhysicsOrchestrator.ts#L126)

Injeta o ResourceManager no loader, habilitando a alocação do buffer
global de RigidBody a partir do próximo `step()`.

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

Defined in: [scene/rendering/GpuPhysicsOrchestrator.ts:173](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/rendering/GpuPhysicsOrchestrator.ts#L173)

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

Defined in: [scene/rendering/GpuPhysicsOrchestrator.ts:167](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/rendering/GpuPhysicsOrchestrator.ts#L167)

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

Defined in: [scene/rendering/GpuPhysicsOrchestrator.ts:163](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/rendering/GpuPhysicsOrchestrator.ts#L163)

GPU-only: solvers por tipo de corpo não se aplicam. No-op com aviso.

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

Defined in: [scene/rendering/GpuPhysicsOrchestrator.ts:181](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/rendering/GpuPhysicsOrchestrator.ts#L181)

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
