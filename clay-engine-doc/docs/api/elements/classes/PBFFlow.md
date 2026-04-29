[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / PBFFlow

# Class: PBFFlow

Defined in: [elements/physics/flows/PBFFlow.ts:39](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/flows/PBFFlow.ts#L39)

## Extends

- `Flow`

## Constructors

### Constructor

> **new PBFFlow**(`core`, `world`, `resources`, `options?`): `PBFFlow`

Defined in: [elements/physics/flows/PBFFlow.ts:75](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/flows/PBFFlow.ts#L75)

#### Parameters

##### core

`EngineCore`

##### world

`World`

##### resources

`ResourceSystem`

##### options?

`PBFFlowOptions` = `{}`

#### Returns

`PBFFlow`

#### Overrides

`Flow.constructor`

## Properties

### bodyType

> `readonly` **bodyType**: `"PBFParticle:PBF"` = `'PBFParticle:PBF'`

Defined in: [elements/physics/flows/PBFFlow.ts:41](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/flows/PBFFlow.ts#L41)

#### Overrides

`Flow.bodyType`

***

### phase

> `readonly` **phase**: `Phase` = `'physics'`

Defined in: [elements/physics/flows/PBFFlow.ts:42](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/flows/PBFFlow.ts#L42)

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

> `readonly` **type**: `"PBFFlow"` = `'PBFFlow'`

Defined in: [elements/physics/flows/PBFFlow.ts:40](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/flows/PBFFlow.ts#L40)

#### Overrides

`Flow.type`

## Methods

### dispatch()

> **dispatch**(`frame`): `void`

Defined in: [elements/physics/flows/PBFFlow.ts:205](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/flows/PBFFlow.ts#L205)

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

Defined in: [elements/physics/flows/PBFFlow.ts:92](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/flows/PBFFlow.ts#L92)

#### Returns

readonly `PipelineDescriptor`[]

#### Overrides

`Flow.getPipelineDescriptors`

***

### isReady()

> **isReady**(): `boolean`

Defined in: [elements/physics/flows/PBFFlow.ts:105](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/flows/PBFFlow.ts#L105)

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

> **onEntitiesRemoved**(`_entityIds`): `void`

Defined in: [scene/flows/Flow.ts:34](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/scene/flows/Flow.ts#L34)

Chamado quando entidades são removidas do World. Subclasses que
cacheiam slots por EntityId devem limpar os entries afetados.

#### Parameters

##### \_entityIds

readonly `number`[]

#### Returns

`void`

#### Inherited from

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

> **onPoolReallocated**(`poolKey`): `void`

Defined in: [elements/physics/flows/PBFFlow.ts:109](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/flows/PBFFlow.ts#L109)

Chamado quando um pool com `poolKey` tem seu buffer realocado pelo
ResourceSystem (growth 2× ou regeneração). Subclasses que cacheiam
`BindGroupSpec` dependentes do pool devem invalidar o cache aqui
(set para null) para que a próxima dispatch reconstrua via
`resources.poolBindGroup(poolKey)`.

#### Parameters

##### poolKey

`string`

#### Returns

`void`

#### Overrides

`Flow.onPoolReallocated`
