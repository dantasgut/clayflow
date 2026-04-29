[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / DragField

# Class: DragField

Defined in: [elements/physics/forcefields/DragField.ts:6](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/forcefields/DragField.ts#L6)

## Extends

- [`ForceField`](ForceField.md)

## Constructors

### Constructor

> **new DragField**(`values?`): `DragField`

Defined in: [elements/physics/forcefields/DragField.ts:14](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/forcefields/DragField.ts#L14)

#### Parameters

##### values?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`DragField`

#### Overrides

[`ForceField`](ForceField.md).[`constructor`](ForceField.md#constructor)

## Properties

### data

> **data**: `Record`\<`string`, `unknown`\> = `{}`

Defined in: [elements/physics/forcefields/ForceField.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/forcefields/ForceField.ts#L9)

#### Inherited from

[`ForceField`](ForceField.md).[`data`](ForceField.md#data)

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/physics/forcefields/ForceField.ts:8](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/forcefields/ForceField.ts#L8)

#### Inherited from

[`ForceField`](ForceField.md).[`state`](ForceField.md#state)

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/physics/forcefields/DragField.ts:7](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/forcefields/DragField.ts#L7)

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)[]

Defined in: [scene/contracts/Entity.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/scene/contracts/Entity.ts#L9)

##### Returns

readonly [`Entity`](Entity.md)[]

#### Inherited from

[`ForceField`](ForceField.md).[`attached`](ForceField.md#attached)

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

[`ForceField`](ForceField.md).[`add`](ForceField.md#add)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/physics/forcefields/DragField.ts:22](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/forcefields/DragField.ts#L22)

#### Returns

readonly `GPUDescriptor`[]

#### Overrides

[`ForceField`](ForceField.md).[`getDescriptors`](ForceField.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/physics/forcefields/ForceField.ts:13](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/forcefields/ForceField.ts#L13)

#### Returns

readonly `PipelineDescriptor`[]

#### Inherited from

[`ForceField`](ForceField.md).[`getPipelineDescriptors`](ForceField.md#getpipelinedescriptors)
