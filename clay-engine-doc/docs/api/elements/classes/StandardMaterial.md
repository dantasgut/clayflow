[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / StandardMaterial

# Class: StandardMaterial

Defined in: [elements/material/StandardMaterial.ts:8](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/material/StandardMaterial.ts#L8)

## Extends

- [`Material`](Material.md)

## Constructors

### Constructor

> **new StandardMaterial**(`values?`): `StandardMaterial`

Defined in: [elements/material/StandardMaterial.ts:17](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/material/StandardMaterial.ts#L17)

#### Parameters

##### values?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`StandardMaterial`

#### Overrides

[`Material`](Material.md).[`constructor`](Material.md#constructor)

## Properties

### data

> **data**: `Record`\<`string`, `unknown`\> = `{}`

Defined in: [elements/material/Material.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/material/Material.ts#L9)

#### Inherited from

[`Material`](Material.md).[`data`](Material.md#data)

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/material/Material.ts:8](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/material/Material.ts#L8)

#### Inherited from

[`Material`](Material.md).[`state`](Material.md#state)

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/material/StandardMaterial.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/material/StandardMaterial.ts#L9)

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)[]

Defined in: [scene/contracts/Entity.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/scene/contracts/Entity.ts#L9)

##### Returns

readonly [`Entity`](Entity.md)[]

#### Inherited from

[`Material`](Material.md).[`attached`](Material.md#attached)

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

[`Material`](Material.md).[`add`](Material.md#add)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/material/StandardMaterial.ts:26](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/material/StandardMaterial.ts#L26)

#### Returns

readonly `GPUDescriptor`[]

#### Overrides

[`Material`](Material.md).[`getDescriptors`](Material.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/material/StandardMaterial.ts:30](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/material/StandardMaterial.ts#L30)

#### Returns

readonly `PipelineDescriptor`[]

#### Overrides

[`Material`](Material.md).[`getPipelineDescriptors`](Material.md#getpipelinedescriptors)
