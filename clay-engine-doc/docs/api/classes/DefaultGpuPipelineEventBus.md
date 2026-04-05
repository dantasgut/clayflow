# Class: DefaultGpuPipelineEventBus

Defined in: [scene/systems/gpu/DefaultGpuPipelineEventBus.ts:11](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/systems/gpu/DefaultGpuPipelineEventBus.ts#L11)

Implementação padrão do GpuPipelineEventBus.
Handlers síncronos com snapshot para segurança durante emit.

## Implements

- [`GpuPipelineEventBus`](../interfaces/GpuPipelineEventBus.md)

## Constructors

### Constructor

> **new DefaultGpuPipelineEventBus**(): `DefaultGpuPipelineEventBus`

#### Returns

`DefaultGpuPipelineEventBus`

## Methods

### emit()

> **emit**\<`K`\>(`type`, `payload`): `void`

Defined in: [scene/systems/gpu/DefaultGpuPipelineEventBus.ts:33](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/systems/gpu/DefaultGpuPipelineEventBus.ts#L33)

#### Type Parameters

##### K

`K` *extends* keyof `GpuPipelineEventMap`

#### Parameters

##### type

`K`

##### payload

`GpuPipelineEventMap`\[`K`\]

#### Returns

`void`

#### Implementation of

[`GpuPipelineEventBus`](../interfaces/GpuPipelineEventBus.md).[`emit`](../interfaces/GpuPipelineEventBus.md#emit)

***

### off()

> **off**\<`K`\>(`type`, `handler`): `void`

Defined in: [scene/systems/gpu/DefaultGpuPipelineEventBus.ts:26](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/systems/gpu/DefaultGpuPipelineEventBus.ts#L26)

#### Type Parameters

##### K

`K` *extends* keyof `GpuPipelineEventMap`

#### Parameters

##### type

`K`

##### handler

(`payload`) => `void`

#### Returns

`void`

#### Implementation of

[`GpuPipelineEventBus`](../interfaces/GpuPipelineEventBus.md).[`off`](../interfaces/GpuPipelineEventBus.md#off)

***

### on()

> **on**\<`K`\>(`type`, `handler`): () => `void`

Defined in: [scene/systems/gpu/DefaultGpuPipelineEventBus.ts:15](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/systems/gpu/DefaultGpuPipelineEventBus.ts#L15)

#### Type Parameters

##### K

`K` *extends* keyof `GpuPipelineEventMap`

#### Parameters

##### type

`K`

##### handler

(`payload`) => `void`

#### Returns

() => `void`

#### Implementation of

[`GpuPipelineEventBus`](../interfaces/GpuPipelineEventBus.md).[`on`](../interfaces/GpuPipelineEventBus.md#on)
