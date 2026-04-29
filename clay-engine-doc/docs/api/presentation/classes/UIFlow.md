[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / UIFlow

# Class: UIFlow

Defined in: [presentation/flows/UIFlow.ts:37](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/UIFlow.ts#L37)

## Extends

- `Flow`

## Constructors

### Constructor

> **new UIFlow**(`core`, `canvas`): `UIFlow`

Defined in: [presentation/flows/UIFlow.ts:59](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/UIFlow.ts#L59)

#### Parameters

##### core

`EngineCore`

##### canvas

`HTMLCanvasElement`

#### Returns

`UIFlow`

#### Overrides

`Flow.constructor`

## Properties

### bodyType

> `readonly` **bodyType**: `""` = `''`

Defined in: [presentation/flows/UIFlow.ts:39](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/UIFlow.ts#L39)

#### Overrides

`Flow.bodyType`

***

### phase

> `readonly` **phase**: `Phase` = `'ui'`

Defined in: [presentation/flows/UIFlow.ts:40](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/UIFlow.ts#L40)

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

> `readonly` **type**: `"UIFlow"` = `'UIFlow'`

Defined in: [presentation/flows/UIFlow.ts:38](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/UIFlow.ts#L38)

#### Overrides

`Flow.type`

## Accessors

### ui

#### Get Signature

> **get** **ui**(): [`UiTree`](UiTree.md)

Defined in: [presentation/flows/UIFlow.ts:63](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/UIFlow.ts#L63)

##### Returns

[`UiTree`](UiTree.md)

## Methods

### dispatch()

> **dispatch**(`frame`): `void`

Defined in: [presentation/flows/UIFlow.ts:289](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/UIFlow.ts#L289)

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

Defined in: [presentation/flows/UIFlow.ts:102](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/UIFlow.ts#L102)

#### Returns

readonly `PipelineDescriptor`[]

#### Overrides

`Flow.getPipelineDescriptors`

***

### isReady()

> **isReady**(): `boolean`

Defined in: [presentation/flows/UIFlow.ts:111](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/UIFlow.ts#L111)

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

***

### setFont()

> **setFont**(`font`): `this`

Defined in: [presentation/flows/UIFlow.ts:67](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/UIFlow.ts#L67)

#### Parameters

##### font

[`LoadedFont`](../interfaces/LoadedFont.md)

#### Returns

`this`
