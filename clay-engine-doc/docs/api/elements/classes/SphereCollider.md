[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SphereCollider

# Class: SphereCollider

Defined in: [elements/physics/colliders/SphereCollider.ts:6](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/colliders/SphereCollider.ts#L6)

## Extends

- [`Collider`](Collider.md)

## Constructors

### Constructor

> **new SphereCollider**(`values?`): `SphereCollider`

Defined in: [elements/physics/colliders/SphereCollider.ts:15](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/colliders/SphereCollider.ts#L15)

#### Parameters

##### values?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`SphereCollider`

#### Overrides

[`Collider`](Collider.md).[`constructor`](Collider.md#constructor)

## Properties

### data

> **data**: `Record`\<`string`, `unknown`\> = `{}`

Defined in: [elements/physics/colliders/Collider.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/colliders/Collider.ts#L9)

#### Inherited from

[`Collider`](Collider.md).[`data`](Collider.md#data)

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/physics/colliders/Collider.ts:8](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/colliders/Collider.ts#L8)

#### Inherited from

[`Collider`](Collider.md).[`state`](Collider.md#state)

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/physics/colliders/SphereCollider.ts:7](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/colliders/SphereCollider.ts#L7)

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)[]

Defined in: [scene/contracts/Entity.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/scene/contracts/Entity.ts#L9)

##### Returns

readonly [`Entity`](Entity.md)[]

#### Inherited from

[`Collider`](Collider.md).[`attached`](Collider.md#attached)

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

[`Collider`](Collider.md).[`add`](Collider.md#add)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/physics/colliders/SphereCollider.ts:23](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/colliders/SphereCollider.ts#L23)

#### Returns

readonly `GPUDescriptor`[]

#### Overrides

[`Collider`](Collider.md).[`getDescriptors`](Collider.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/physics/colliders/Collider.ts:13](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/colliders/Collider.ts#L13)

#### Returns

readonly `PipelineDescriptor`[]

#### Inherited from

[`Collider`](Collider.md).[`getPipelineDescriptors`](Collider.md#getpipelinedescriptors)
