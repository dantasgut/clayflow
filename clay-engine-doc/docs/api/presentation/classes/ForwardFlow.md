[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ForwardFlow

# Class: ForwardFlow

Defined in: [presentation/flows/ForwardFlow.ts:45](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/ForwardFlow.ts#L45)

## Extends

- `RenderFlow`

## Constructors

### Constructor

> **new ForwardFlow**(`core`, `world`, `resources`, `canvas`): `ForwardFlow`

Defined in: [presentation/flows/ForwardFlow.ts:73](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/ForwardFlow.ts#L73)

#### Parameters

##### core

`EngineCore`

##### world

`World`

##### resources

`ResourceSystem`

##### canvas

`HTMLCanvasElement`

#### Returns

`ForwardFlow`

#### Overrides

`RenderFlow.constructor`

## Properties

### bodyType

> `readonly` **bodyType**: `""` = `''`

Defined in: [presentation/flows/ForwardFlow.ts:47](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/ForwardFlow.ts#L47)

#### Overrides

`RenderFlow.bodyType`

***

### phase

> `readonly` **phase**: `Phase` = `'forward'`

Defined in: [presentation/flows/ForwardFlow.ts:48](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/ForwardFlow.ts#L48)

#### Overrides

`RenderFlow.phase`

***

### priority

> **priority**: `number` = `0`

Defined in: [presentation/flows/ForwardFlow.ts:49](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/ForwardFlow.ts#L49)

#### Overrides

`RenderFlow.priority`

***

### type

> `readonly` **type**: `"ForwardFlow"` = `'ForwardFlow'`

Defined in: [presentation/flows/ForwardFlow.ts:46](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/ForwardFlow.ts#L46)

#### Overrides

`RenderFlow.type`

## Accessors

### colorOutputView

#### Get Signature

> **get** **colorOutputView**(): `TextureViewSpec` \| `null`

Defined in: [presentation/flows/ForwardFlow.ts:92](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/ForwardFlow.ts#L92)

##### Returns

`TextureViewSpec` \| `null`

## Methods

### bindShadowFlow()

> **bindShadowFlow**(`shadowFlow`): `this`

Defined in: [presentation/flows/ForwardFlow.ts:82](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/ForwardFlow.ts#L82)

#### Parameters

##### shadowFlow

[`ShadowFlow`](ShadowFlow.md)

#### Returns

`this`

***

### dispatch()

> **dispatch**(`frame`): `void`

Defined in: [presentation/flows/ForwardFlow.ts:135](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/ForwardFlow.ts#L135)

#### Parameters

##### frame

`Frame`

#### Returns

`void`

#### Overrides

`RenderFlow.dispatch`

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [presentation/flows/ForwardFlow.ts:96](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/ForwardFlow.ts#L96)

#### Returns

readonly `PipelineDescriptor`[]

#### Overrides

`RenderFlow.getPipelineDescriptors`

***

### isReady()

> **isReady**(): `boolean`

Defined in: [presentation/flows/ForwardFlow.ts:100](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/ForwardFlow.ts#L100)

#### Returns

`boolean`

#### Overrides

`RenderFlow.isReady`

***

### onCanvasResized()

> **onCanvasResized**(`_width`, `_height`): `void`

Defined in: [presentation/flows/ForwardFlow.ts:110](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/ForwardFlow.ts#L110)

Chamado quando o canvas é redimensionado. Subclasses que mantêm
textures de tamanho-de-canvas (depth, color offscreen, ping-pong)
devem invalidar para recriarem na próxima dispatch.

#### Parameters

##### \_width

`number`

##### \_height

`number`

#### Returns

`void`

#### Overrides

`RenderFlow.onCanvasResized`

***

### onEntitiesRemoved()

> **onEntitiesRemoved**(`entityIds`): `void`

Defined in: [presentation/flows/ForwardFlow.ts:121](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/ForwardFlow.ts#L121)

Chamado quando entidades são removidas do World. Subclasses que
cacheiam slots por EntityId devem limpar os entries afetados.

#### Parameters

##### entityIds

readonly `number`[]

#### Returns

`void`

#### Overrides

`RenderFlow.onEntitiesRemoved`

***

### onEvent()

> **onEvent**(`_event`, `_payload`): `void`

Defined in: [scene/flows/Flow.ts:15](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/scene/flows/Flow.ts#L15)

#### Parameters

##### \_event

`string`

##### \_payload

`unknown`

#### Returns

`void`

#### Inherited from

`RenderFlow.onEvent`

***

### onPoolReallocated()

> **onPoolReallocated**(`_poolKey`): `void`

Defined in: [presentation/flows/ForwardFlow.ts:104](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/ForwardFlow.ts#L104)

Chamado quando um pool com `poolKey` tem seu buffer realocado pelo
ResourceSystem (growth 2× ou regeneração). Subclasses que cacheiam
`BindGroupSpec` dependentes do pool devem invalidar o cache aqui
(set para null) para que a próxima dispatch reconstrua via
`resources.poolBindGroup(poolKey)`.

#### Parameters

##### \_poolKey

`string`

#### Returns

`void`

#### Overrides

`RenderFlow.onPoolReallocated`

***

### recordRenderPass()

> **recordRenderPass**(`_frame`, `_target`): `void`

Defined in: [presentation/flows/ForwardFlow.ts:131](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/ForwardFlow.ts#L131)

#### Parameters

##### \_frame

`Frame`

##### \_target

`RenderTarget`

#### Returns

`void`

#### Overrides

`RenderFlow.recordRenderPass`

***

### resolveTarget()

> **resolveTarget**(): `RenderTarget`

Defined in: [presentation/flows/ForwardFlow.ts:127](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/ForwardFlow.ts#L127)

#### Returns

`RenderTarget`

#### Overrides

`RenderFlow.resolveTarget`

***

### setRenderToOffscreen()

> **setRenderToOffscreen**(`enabled`): `this`

Defined in: [presentation/flows/ForwardFlow.ts:87](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/ForwardFlow.ts#L87)

#### Parameters

##### enabled

`boolean`

#### Returns

`this`
