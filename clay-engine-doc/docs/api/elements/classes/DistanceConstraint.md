[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / DistanceConstraint

# Class: DistanceConstraint

Defined in: [elements/physics/constraints/DistanceConstraint.ts:13](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/constraints/DistanceConstraint.ts#L13)

DistanceConstraint segue o struct WGSL `DistanceConstraint` (16 bytes):
  i: u32           — índice do body A no pool de partículas
  j: u32           — índice do body B no pool de partículas
  rest_length: f32 — comprimento de repouso (m)
  compliance: f32  — m/N (0 = totalmente rígido)

## Extends

- [`Constraint`](Constraint.md)

## Constructors

### Constructor

> **new DistanceConstraint**(`values?`): `DistanceConstraint`

Defined in: [elements/physics/constraints/DistanceConstraint.ts:21](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/constraints/DistanceConstraint.ts#L21)

#### Parameters

##### values?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`DistanceConstraint`

#### Overrides

[`Constraint`](Constraint.md).[`constructor`](Constraint.md#constructor)

## Properties

### data

> **data**: `Record`\<`string`, `unknown`\> = `{}`

Defined in: [elements/physics/constraints/Constraint.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/constraints/Constraint.ts#L9)

#### Inherited from

[`Constraint`](Constraint.md).[`data`](Constraint.md#data)

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/physics/constraints/Constraint.ts:8](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/constraints/Constraint.ts#L8)

#### Inherited from

[`Constraint`](Constraint.md).[`state`](Constraint.md#state)

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/physics/constraints/DistanceConstraint.ts:14](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/constraints/DistanceConstraint.ts#L14)

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)[]

Defined in: [scene/contracts/Entity.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/scene/contracts/Entity.ts#L9)

##### Returns

readonly [`Entity`](Entity.md)[]

#### Inherited from

[`Constraint`](Constraint.md).[`attached`](Constraint.md#attached)

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

[`Constraint`](Constraint.md).[`add`](Constraint.md#add)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/physics/constraints/DistanceConstraint.ts:31](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/constraints/DistanceConstraint.ts#L31)

#### Returns

readonly `GPUDescriptor`[]

#### Overrides

[`Constraint`](Constraint.md).[`getDescriptors`](Constraint.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/physics/constraints/Constraint.ts:13](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/constraints/Constraint.ts#L13)

#### Returns

readonly `PipelineDescriptor`[]

#### Inherited from

[`Constraint`](Constraint.md).[`getPipelineDescriptors`](Constraint.md#getpipelinedescriptors)
