[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / PhysicsBody

# Abstract Class: PhysicsBody

Defined in: [elements/physics/bodies/PhysicsBody.ts:8](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/PhysicsBody.ts#L8)

## Extends

- [`Entity`](Entity.md)

## Extended by

- [`RigidBody`](RigidBody.md)
- [`SoftBody`](SoftBody.md)
- [`FluidBody`](FluidBody.md)
- [`MPMBody`](MPMBody.md)
- [`SPHBody`](SPHBody.md)
- [`PBFBody`](PBFBody.md)

## Implements

- `Resource`

## Constructors

### Constructor

> **new PhysicsBody**(): `PhysicsBody`

#### Returns

`PhysicsBody`

#### Inherited from

[`Entity`](Entity.md).[`constructor`](Entity.md#constructor)

## Properties

### data

> **data**: `Record`\<`string`, `unknown`\> = `{}`

Defined in: [elements/physics/bodies/PhysicsBody.ts:10](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/PhysicsBody.ts#L10)

#### Implementation of

`Resource.data`

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/physics/bodies/PhysicsBody.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/PhysicsBody.ts#L9)

#### Implementation of

`Resource.state`

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

> `abstract` **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/physics/bodies/PhysicsBody.ts:12](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/PhysicsBody.ts#L12)

#### Returns

readonly `GPUDescriptor`[]

#### Implementation of

`Resource.getDescriptors`

***

### getFlowDescriptors()

> `abstract` **getFlowDescriptors**(): readonly `FlowDescriptor`[]

Defined in: [elements/physics/bodies/PhysicsBody.ts:18](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/PhysicsBody.ts#L18)

#### Returns

readonly `FlowDescriptor`[]

#### Implementation of

`Resource.getFlowDescriptors`

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/physics/bodies/PhysicsBody.ts:14](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/PhysicsBody.ts#L14)

#### Returns

readonly `PipelineDescriptor`[]

#### Implementation of

`Resource.getPipelineDescriptors`
