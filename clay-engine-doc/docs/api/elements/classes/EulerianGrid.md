[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / EulerianGrid

# Class: EulerianGrid

Defined in: [elements/gpu/EulerianGrid.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/gpu/EulerianGrid.ts#L9)

## Extends

- [`Entity`](Entity.md)

## Implements

- `Resource`

## Constructors

### Constructor

> **new EulerianGrid**(`values?`): `EulerianGrid`

Defined in: [elements/gpu/EulerianGrid.ts:23](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/gpu/EulerianGrid.ts#L23)

#### Parameters

##### values?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`EulerianGrid`

#### Overrides

[`Entity`](Entity.md).[`constructor`](Entity.md#constructor)

## Properties

### data

> **data**: `Record`\<`string`, `unknown`\> = `{}`

Defined in: [elements/gpu/EulerianGrid.ts:21](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/gpu/EulerianGrid.ts#L21)

#### Implementation of

`Resource.data`

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/gpu/EulerianGrid.ts:20](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/gpu/EulerianGrid.ts#L20)

#### Implementation of

`Resource.state`

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/gpu/EulerianGrid.ts:10](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/gpu/EulerianGrid.ts#L10)

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

Defined in: [elements/gpu/EulerianGrid.ts:36](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/gpu/EulerianGrid.ts#L36)

#### Returns

readonly `GPUDescriptor`[]

#### Implementation of

`Resource.getDescriptors`

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/gpu/EulerianGrid.ts:40](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/gpu/EulerianGrid.ts#L40)

#### Returns

readonly `PipelineDescriptor`[]

#### Implementation of

`Resource.getPipelineDescriptors`
