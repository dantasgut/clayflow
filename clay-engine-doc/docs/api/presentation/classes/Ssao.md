[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / Ssao

# Class: Ssao

Defined in: [presentation/flows/effects/Ssao.ts:3](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/effects/Ssao.ts#L3)

## Extends

- [`PostProcessEffect`](PostProcessEffect.md)

## Constructors

### Constructor

> **new Ssao**(`options?`): `Ssao`

Defined in: [presentation/resources/PostProcessEffect.ts:17](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/resources/PostProcessEffect.ts#L17)

#### Parameters

##### options?

[`PostProcessOptions`](../interfaces/PostProcessOptions.md) = `{}`

#### Returns

`Ssao`

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`constructor`](PostProcessEffect.md#constructor)

## Properties

### data

> **data**: `Record`\<`string`, `unknown`\> = `{}`

Defined in: [presentation/resources/PostProcessEffect.ts:15](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/resources/PostProcessEffect.ts#L15)

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`data`](PostProcessEffect.md#data)

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [presentation/resources/PostProcessEffect.ts:14](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/resources/PostProcessEffect.ts#L14)

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`state`](PostProcessEffect.md#state)

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](../../elements/classes/Entity.md)[]

Defined in: [scene/contracts/Entity.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/scene/contracts/Entity.ts#L9)

##### Returns

readonly [`Entity`](../../elements/classes/Entity.md)[]

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`attached`](PostProcessEffect.md#attached)

***

### fragmentEntry

#### Get Signature

> **get** **fragmentEntry**(): `string`

Defined in: [presentation/flows/effects/Ssao.ts:5](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/effects/Ssao.ts#L5)

##### Returns

`string`

#### Overrides

[`PostProcessEffect`](PostProcessEffect.md).[`fragmentEntry`](PostProcessEffect.md#fragmententry)

***

### isEnabled

#### Get Signature

> **get** **isEnabled**(): `boolean`

Defined in: [presentation/resources/PostProcessEffect.ts:29](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/resources/PostProcessEffect.ts#L29)

##### Returns

`boolean`

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`isEnabled`](PostProcessEffect.md#isenabled)

***

### name

#### Get Signature

> **get** **name**(): `string`

Defined in: [presentation/flows/effects/Ssao.ts:4](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/flows/effects/Ssao.ts#L4)

##### Returns

`string`

#### Overrides

[`PostProcessEffect`](PostProcessEffect.md).[`name`](PostProcessEffect.md#name)

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

[`PostProcessEffect`](PostProcessEffect.md).[`add`](PostProcessEffect.md#add)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [presentation/resources/PostProcessEffect.ts:44](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/resources/PostProcessEffect.ts#L44)

#### Returns

readonly `GPUDescriptor`[]

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`getDescriptors`](PostProcessEffect.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [presentation/resources/PostProcessEffect.ts:45](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/resources/PostProcessEffect.ts#L45)

#### Returns

readonly `PipelineDescriptor`[]

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`getPipelineDescriptors`](PostProcessEffect.md#getpipelinedescriptors)

***

### paramsBytes()

> **paramsBytes**(): `Uint8Array`

Defined in: [presentation/resources/PostProcessEffect.ts:33](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/resources/PostProcessEffect.ts#L33)

#### Returns

`Uint8Array`

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`paramsBytes`](PostProcessEffect.md#paramsbytes)
