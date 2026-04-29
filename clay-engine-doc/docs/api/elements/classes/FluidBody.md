[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / FluidBody

# Class: FluidBody

Defined in: [elements/physics/bodies/FluidBody.ts:13](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/FluidBody.ts#L13)

## Extends

- [`PhysicsBody`](PhysicsBody.md)

## Constructors

### Constructor

> **new FluidBody**(`values?`, `options?`): `FluidBody`

Defined in: [elements/physics/bodies/FluidBody.ts:27](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/FluidBody.ts#L27)

#### Parameters

##### values?

`Record`\<`string`, `unknown`\> = `{}`

##### options?

[`FluidBodyOptions`](../interfaces/FluidBodyOptions.md) = `{}`

#### Returns

`FluidBody`

#### Overrides

[`PhysicsBody`](PhysicsBody.md).[`constructor`](PhysicsBody.md#constructor)

## Properties

### data

> **data**: `Record`\<`string`, `unknown`\> = `{}`

Defined in: [elements/physics/bodies/PhysicsBody.ts:10](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/PhysicsBody.ts#L10)

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`data`](PhysicsBody.md#data)

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/physics/bodies/PhysicsBody.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/PhysicsBody.ts#L9)

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`state`](PhysicsBody.md#state)

***

### defaultAlgorithm

> `readonly` `static` **defaultAlgorithm**: [`FluidBodyAlgorithm`](../type-aliases/FluidBodyAlgorithm.md) = `'SPH'`

Defined in: [elements/physics/bodies/FluidBody.ts:23](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/FluidBody.ts#L23)

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/physics/bodies/FluidBody.ts:14](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/FluidBody.ts#L14)

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)[]

Defined in: [scene/contracts/Entity.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/scene/contracts/Entity.ts#L9)

##### Returns

readonly [`Entity`](Entity.md)[]

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`attached`](PhysicsBody.md#attached)

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

[`PhysicsBody`](PhysicsBody.md).[`add`](PhysicsBody.md#add)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/physics/bodies/FluidBody.ts:40](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/FluidBody.ts#L40)

#### Returns

readonly `GPUDescriptor`[]

#### Overrides

[`PhysicsBody`](PhysicsBody.md).[`getDescriptors`](PhysicsBody.md#getdescriptors)

***

### getFlowDescriptors()

> **getFlowDescriptors**(): readonly `FlowDescriptor`[]

Defined in: [elements/physics/bodies/FluidBody.ts:49](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/FluidBody.ts#L49)

#### Returns

readonly `FlowDescriptor`[]

#### Overrides

[`PhysicsBody`](PhysicsBody.md).[`getFlowDescriptors`](PhysicsBody.md#getflowdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/physics/bodies/PhysicsBody.ts:14](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/PhysicsBody.ts#L14)

#### Returns

readonly `PipelineDescriptor`[]

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`getPipelineDescriptors`](PhysicsBody.md#getpipelinedescriptors)
