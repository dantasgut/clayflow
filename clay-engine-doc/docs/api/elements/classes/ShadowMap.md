[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ShadowMap

# Class: ShadowMap

Defined in: [elements/scene/ShadowMap.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/scene/ShadowMap.ts#L9)

## Extends

- [`Entity`](Entity.md)

## Implements

- `Resource`

## Constructors

### Constructor

> **new ShadowMap**(`values?`): `ShadowMap`

Defined in: [elements/scene/ShadowMap.ts:20](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/scene/ShadowMap.ts#L20)

#### Parameters

##### values?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`ShadowMap`

#### Overrides

[`Entity`](Entity.md).[`constructor`](Entity.md#constructor)

## Properties

### data

> **data**: `Record`\<`string`, `unknown`\> = `{}`

Defined in: [elements/scene/ShadowMap.ts:18](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/scene/ShadowMap.ts#L18)

#### Implementation of

`Resource.data`

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/scene/ShadowMap.ts:17](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/scene/ShadowMap.ts#L17)

#### Implementation of

`Resource.state`

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/scene/ShadowMap.ts:10](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/scene/ShadowMap.ts#L10)

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)[]

Defined in: [scene/contracts/Entity.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/scene/contracts/Entity.ts#L9)

##### Returns

readonly [`Entity`](Entity.md)[]

#### Inherited from

[`Entity`](Entity.md).[`attached`](Entity.md#attached)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:4](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/scene/contracts/Entity.ts#L4)

#### Parameters

##### e

[`Entity`](Entity.md)

#### Returns

`this`

#### Inherited from

[`Entity`](Entity.md).[`add`](Entity.md#add)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/scene/ShadowMap.ts:30](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/scene/ShadowMap.ts#L30)

#### Returns

readonly `GPUDescriptor`[]

#### Implementation of

`Resource.getDescriptors`

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/scene/ShadowMap.ts:39](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/scene/ShadowMap.ts#L39)

#### Returns

readonly `PipelineDescriptor`[]

#### Implementation of

`Resource.getPipelineDescriptors`
