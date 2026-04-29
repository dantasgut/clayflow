[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / DirectionalLight

# Class: DirectionalLight

Defined in: [elements/scene/DirectionalLight.ts:3](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/scene/DirectionalLight.ts#L3)

## Extends

- [`Light`](Light.md)

## Constructors

### Constructor

> **new DirectionalLight**(`values?`): `DirectionalLight`

Defined in: [elements/scene/DirectionalLight.ts:4](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/scene/DirectionalLight.ts#L4)

#### Parameters

##### values?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`DirectionalLight`

#### Overrides

[`Light`](Light.md).[`constructor`](Light.md#constructor)

## Properties

### data

> **data**: `Record`\<`string`, `unknown`\> = `{}`

Defined in: [elements/scene/Light.ts:21](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/scene/Light.ts#L21)

#### Inherited from

[`Light`](Light.md).[`data`](Light.md#data)

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/scene/Light.ts:20](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/scene/Light.ts#L20)

#### Inherited from

[`Light`](Light.md).[`state`](Light.md#state)

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/scene/Light.ts:10](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/scene/Light.ts#L10)

#### Inherited from

[`Light`](Light.md).[`schema`](Light.md#schema)

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)[]

Defined in: [scene/contracts/Entity.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/scene/contracts/Entity.ts#L9)

##### Returns

readonly [`Entity`](Entity.md)[]

#### Inherited from

[`Light`](Light.md).[`attached`](Light.md#attached)

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

[`Light`](Light.md).[`add`](Light.md#add)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/scene/Light.ts:23](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/scene/Light.ts#L23)

#### Returns

readonly `GPUDescriptor`[]

#### Inherited from

[`Light`](Light.md).[`getDescriptors`](Light.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/scene/Light.ts:32](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/scene/Light.ts#L32)

#### Returns

readonly `PipelineDescriptor`[]

#### Inherited from

[`Light`](Light.md).[`getPipelineDescriptors`](Light.md#getpipelinedescriptors)
