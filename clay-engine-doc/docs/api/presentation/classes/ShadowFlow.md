[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ShadowFlow

# Class: ShadowFlow

Defined in: [presentation/flows/ShadowFlow.ts:42](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/ShadowFlow.ts#L42)

## Extends

- `Flow`

## Constructors

### Constructor

> **new ShadowFlow**(`core`, `world`, `resources`, `options?`): `ShadowFlow`

Defined in: [presentation/flows/ShadowFlow.ts:60](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/ShadowFlow.ts#L60)

#### Parameters

##### core

`EngineCore`

##### world

`World`

##### resources

`ResourceSystem`

##### options?

`ShadowFlowOptions` = `{}`

#### Returns

`ShadowFlow`

#### Overrides

`Flow.constructor`

## Properties

### bodyType

> `readonly` **bodyType**: `""` = `''`

Defined in: [presentation/flows/ShadowFlow.ts:44](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/ShadowFlow.ts#L44)

#### Overrides

`Flow.bodyType`

***

### phase

> `readonly` **phase**: `Phase` = `'shadow'`

Defined in: [presentation/flows/ShadowFlow.ts:45](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/ShadowFlow.ts#L45)

#### Overrides

`Flow.phase`

***

### priority

> **priority**: `number` = `0`

Defined in: [scene/flows/Flow.ts:10](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/scene/flows/Flow.ts#L10)

#### Inherited from

`Flow.priority`

***

### type

> `readonly` **type**: `"ShadowFlow"` = `'ShadowFlow'`

Defined in: [presentation/flows/ShadowFlow.ts:43](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/ShadowFlow.ts#L43)

#### Overrides

`Flow.type`

## Accessors

### currentLightDirection

#### Get Signature

> **get** **currentLightDirection**(): readonly \[`number`, `number`, `number`, `number`\]

Defined in: [presentation/flows/ShadowFlow.ts:98](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/ShadowFlow.ts#L98)

##### Returns

readonly \[`number`, `number`, `number`, `number`\]

***

### currentLightViewProj

#### Get Signature

> **get** **currentLightViewProj**(): readonly `number`[]

Defined in: [presentation/flows/ShadowFlow.ts:94](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/ShadowFlow.ts#L94)

##### Returns

readonly `number`[]

***

### depthTextureView

#### Get Signature

> **get** **depthTextureView**(): `TextureViewSpec` \| `null`

Defined in: [presentation/flows/ShadowFlow.ts:84](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/ShadowFlow.ts#L84)

##### Returns

`TextureViewSpec` \| `null`

## Methods

### dispatch()

> **dispatch**(`frame`): `void`

Defined in: [presentation/flows/ShadowFlow.ts:243](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/ShadowFlow.ts#L243)

#### Parameters

##### frame

`Frame`

#### Returns

`void`

#### Overrides

`Flow.dispatch`

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [presentation/flows/ShadowFlow.ts:70](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/ShadowFlow.ts#L70)

#### Returns

readonly `PipelineDescriptor`[]

#### Overrides

`Flow.getPipelineDescriptors`

***

### isReady()

> **isReady**(): `boolean`

Defined in: [presentation/flows/ShadowFlow.ts:80](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/ShadowFlow.ts#L80)

#### Returns

`boolean`

#### Overrides

`Flow.isReady`

***

### onCanvasResized()

> **onCanvasResized**(`_width`, `_height`): `void`

Defined in: [scene/flows/Flow.ts:43](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/scene/flows/Flow.ts#L43)

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

#### Inherited from

`Flow.onCanvasResized`

***

### onEntitiesRemoved()

> **onEntitiesRemoved**(`entityIds`): `void`

Defined in: [presentation/flows/ShadowFlow.ts:88](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/ShadowFlow.ts#L88)

Chamado quando entidades são removidas do World. Subclasses que
cacheiam slots por EntityId devem limpar os entries afetados.

#### Parameters

##### entityIds

readonly `number`[]

#### Returns

`void`

#### Overrides

`Flow.onEntitiesRemoved`

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

`Flow.onEvent`

***

### onPoolReallocated()

> **onPoolReallocated**(`_poolKey`): `void`

Defined in: [scene/flows/Flow.ts:26](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/scene/flows/Flow.ts#L26)

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

#### Inherited from

`Flow.onPoolReallocated`
