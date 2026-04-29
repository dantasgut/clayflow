[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / RigidBody

# Class: RigidBody

Defined in: [elements/physics/bodies/RigidBody.ts:13](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/RigidBody.ts#L13)

## Extends

- [`PhysicsBody`](PhysicsBody.md)

## Constructors

### Constructor

> **new RigidBody**(`values?`, `options?`): `RigidBody`

Defined in: [elements/physics/bodies/RigidBody.ts:31](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/RigidBody.ts#L31)

#### Parameters

##### values?

`Record`\<`string`, `unknown`\> = `{}`

##### options?

[`RigidBodyOptions`](../interfaces/RigidBodyOptions.md) = `{}`

#### Returns

`RigidBody`

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

> `readonly` `static` **defaultAlgorithm**: [`RigidBodyAlgorithm`](../type-aliases/RigidBodyAlgorithm.md) = `'LCP'`

Defined in: [elements/physics/bodies/RigidBody.ts:27](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/RigidBody.ts#L27)

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/physics/bodies/RigidBody.ts:14](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/RigidBody.ts#L14)

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

Defined in: [elements/physics/bodies/RigidBody.ts:60](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/RigidBody.ts#L60)

#### Returns

readonly `GPUDescriptor`[]

#### Overrides

[`PhysicsBody`](PhysicsBody.md).[`getDescriptors`](PhysicsBody.md#getdescriptors)

***

### getFlowDescriptors()

> **getFlowDescriptors**(): readonly `FlowDescriptor`[]

Defined in: [elements/physics/bodies/RigidBody.ts:69](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/RigidBody.ts#L69)

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

***

### getPosition()

> **getPosition**(): readonly `number`[]

Defined in: [elements/physics/bodies/RigidBody.ts:78](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/RigidBody.ts#L78)

#### Returns

readonly `number`[]

***

### setPosition()

> **setPosition**(`p`): `void`

Defined in: [elements/physics/bodies/RigidBody.ts:73](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/RigidBody.ts#L73)

#### Parameters

##### p

readonly \[`number`, `number`, `number`, `number`\]

#### Returns

`void`
