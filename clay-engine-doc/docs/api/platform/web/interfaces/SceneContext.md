[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / SceneContext

# Interface: SceneContext

Defined in: [src/scene/SceneContext.ts:28](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/SceneContext.ts#L28)

Bag de instâncias da Camada 2 (Sync). Cada `Application` opera sobre um
`SceneContext` — singletons em `scene/index.ts` continuam funcionando como
a instância default (compatibilidade), mas múltiplos contexts permitem
múltiplos `Application` no mesmo processo (multi-canvas, SSR, tests
paralelos isolados).

## Properties

### consumers

> `readonly` **consumers**: [`ConsumerResolverRegistry`](../classes/ConsumerResolverRegistry.md)

Defined in: [src/scene/SceneContext.ts:44](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/SceneContext.ts#L44)

Resolvers da cena: fontes dos recursos com fornecedor `{ pool }`/`{ consumer }`, por nome.

***

### core

> `readonly` **core**: [`EngineCore`](EngineCore.md)

Defined in: [src/scene/SceneContext.ts:30](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/SceneContext.ts#L30)

EngineCore — Camada 1, abstração GPU device.

***

### events

> `readonly` **events**: [`EventBus`](EventBus.md)

Defined in: [src/scene/SceneContext.ts:32](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/SceneContext.ts#L32)

EventBus pub/sub tipado.

***

### executionSystem

> `readonly` **executionSystem**: [`ExecutionSystem`](../classes/ExecutionSystem.md)

Defined in: [src/scene/SceneContext.ts:40](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/SceneContext.ts#L40)

ExecutionSystem — orquestra dispatch de Flows por frame.

***

### flows

> `readonly` **flows**: [`FlowRegistry`](../classes/FlowRegistry.md)

Defined in: [src/scene/SceneContext.ts:34](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/SceneContext.ts#L34)

FlowRegistry — Flows registrados deste scene.

***

### layoutInferencer

> `readonly` **layoutInferencer**: [`LayoutInferencer`](../classes/LayoutInferencer.md)

Defined in: [src/scene/SceneContext.ts:42](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/SceneContext.ts#L42)

Inferência de layout a partir do WGSL montado (usada na preparação dos pipelines dos Flows).

***

### resourceSystem

> `readonly` **resourceSystem**: [`ResourceSystem`](../classes/ResourceSystem.md)

Defined in: [src/scene/SceneContext.ts:38](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/SceneContext.ts#L38)

ResourceSystem — alocação/upload/dispose de buffers GPU.

***

### time

> `readonly` **time**: [`Time`](../../../presentation/classes/Time.md)

Defined in: [src/scene/SceneContext.ts:49](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/SceneContext.ts#L49)

Relógio da cena — um por World. Inserido no World em `initialize()` (o uniform precisa do device); os
estágios o consultam pelo schema `Time`. `Application.time` é este objeto.

***

### world

> `readonly` **world**: [`World`](../classes/World.md)

Defined in: [src/scene/SceneContext.ts:36](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/SceneContext.ts#L36)

World ECS-like — Resources indexados por schema/tag.

## Methods

### dispose()

> **dispose**(): `void`

Defined in: [src/scene/SceneContext.ts:65](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/SceneContext.ts#L65)

Descarta a cena: desregistra (e descarta) todos os estágios, desfaz as inscrições do `ExecutionSystem` e do
`ResourceSystem` e desliga o core (libera todos os objetos de GPU). Idempotente. Após dispose, o context não
pode ser reutilizado — crie um novo via `createScene()`.

#### Returns

`void`

***

### initialize()

> **initialize**(`surface?`, `canvasOptions?`, `device?`, `platform?`): `Promise`\<`void`\>

Defined in: [src/scene/SceneContext.ts:54](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/SceneContext.ts#L54)

Inicializa o core (device + canvas) e insere o `Time` no World na primeira vez. Idempotente: chamadas
seguintes só reaplicam canvas/opções no core.

#### Parameters

##### surface?

[`PresentationSurface`](PresentationSurface.md)

##### canvasOptions?

`CanvasOptions`

##### device?

[`DeviceOptions`](DeviceOptions.md)

##### platform?

[`PlatformAdapter`](PlatformAdapter.md)\<`unknown`\>

#### Returns

`Promise`\<`void`\>
