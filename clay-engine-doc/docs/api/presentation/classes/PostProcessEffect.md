[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / PostProcessEffect

# Abstract Class: PostProcessEffect

Defined in: [presentation/resources/PostProcessEffect.ts:13](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/resources/PostProcessEffect.ts#L13)

## Extends

- [`Entity`](../../elements/classes/Entity.md)

## Extended by

- [`Bloom`](Bloom.md)
- [`Blur`](Blur.md)
- [`ToneMapping`](ToneMapping.md)
- [`Fxaa`](Fxaa.md)
- [`Ssao`](Ssao.md)
- [`Vignette`](Vignette.md)
- [`ChromaticAberration`](ChromaticAberration.md)
- [`ColorGrading`](ColorGrading.md)

## Implements

- `Resource`

## Constructors

### Constructor

> **new PostProcessEffect**(`options?`): `PostProcessEffect`

Defined in: [presentation/resources/PostProcessEffect.ts:17](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/resources/PostProcessEffect.ts#L17)

#### Parameters

##### options?

[`PostProcessOptions`](../interfaces/PostProcessOptions.md) = `{}`

#### Returns

`PostProcessEffect`

#### Overrides

[`Entity`](../../elements/classes/Entity.md).[`constructor`](../../elements/classes/Entity.md#constructor)

## Properties

### data

> **data**: `Record`\<`string`, `unknown`\> = `{}`

Defined in: [presentation/resources/PostProcessEffect.ts:15](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/resources/PostProcessEffect.ts#L15)

#### Implementation of

`Resource.data`

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [presentation/resources/PostProcessEffect.ts:14](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/resources/PostProcessEffect.ts#L14)

#### Implementation of

`Resource.state`

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](../../elements/classes/Entity.md)[]

Defined in: [scene/contracts/Entity.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/scene/contracts/Entity.ts#L9)

##### Returns

readonly [`Entity`](../../elements/classes/Entity.md)[]

#### Inherited from

[`Entity`](../../elements/classes/Entity.md).[`attached`](../../elements/classes/Entity.md#attached)

***

### fragmentEntry

#### Get Signature

> **get** `abstract` **fragmentEntry**(): `string`

Defined in: [presentation/resources/PostProcessEffect.ts:27](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/resources/PostProcessEffect.ts#L27)

##### Returns

`string`

***

### isEnabled

#### Get Signature

> **get** **isEnabled**(): `boolean`

Defined in: [presentation/resources/PostProcessEffect.ts:29](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/resources/PostProcessEffect.ts#L29)

##### Returns

`boolean`

***

### name

#### Get Signature

> **get** `abstract` **name**(): `string`

Defined in: [presentation/resources/PostProcessEffect.ts:26](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/resources/PostProcessEffect.ts#L26)

##### Returns

`string`

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:4](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/scene/contracts/Entity.ts#L4)

#### Parameters

##### e

[`Entity`](../../elements/classes/Entity.md)

#### Returns

`this`

#### Inherited from

[`Entity`](../../elements/classes/Entity.md).[`add`](../../elements/classes/Entity.md#add)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [presentation/resources/PostProcessEffect.ts:44](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/resources/PostProcessEffect.ts#L44)

#### Returns

readonly `GPUDescriptor`[]

#### Implementation of

`Resource.getDescriptors`

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [presentation/resources/PostProcessEffect.ts:45](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/resources/PostProcessEffect.ts#L45)

#### Returns

readonly `PipelineDescriptor`[]

#### Implementation of

`Resource.getPipelineDescriptors`

***

### paramsBytes()

> **paramsBytes**(): `Uint8Array`

Defined in: [presentation/resources/PostProcessEffect.ts:33](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/resources/PostProcessEffect.ts#L33)

#### Returns

`Uint8Array`
