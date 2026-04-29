[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / BoxGeometry

# Class: BoxGeometry

Defined in: [elements/geometry/BoxGeometry.ts:6](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/geometry/BoxGeometry.ts#L6)

## Extends

- [`Geometry`](Geometry.md)

## Constructors

### Constructor

> **new BoxGeometry**(`values?`): `BoxGeometry`

Defined in: [elements/geometry/BoxGeometry.ts:14](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/geometry/BoxGeometry.ts#L14)

#### Parameters

##### values?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`BoxGeometry`

#### Overrides

[`Geometry`](Geometry.md).[`constructor`](Geometry.md#constructor)

## Properties

### data

> **data**: `Record`\<`string`, `unknown`\> = `{}`

Defined in: [elements/geometry/Geometry.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/geometry/Geometry.ts#L9)

#### Inherited from

[`Geometry`](Geometry.md).[`data`](Geometry.md#data)

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/geometry/Geometry.ts:8](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/geometry/Geometry.ts#L8)

#### Inherited from

[`Geometry`](Geometry.md).[`state`](Geometry.md#state)

***

### schema

> `readonly` `static` **schema**: `StructSchema` = `BoxGeometry.vertexStruct`

Defined in: [elements/geometry/BoxGeometry.ts:12](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/geometry/BoxGeometry.ts#L12)

***

### vertexStruct

> `readonly` `static` **vertexStruct**: `StructSchema`

Defined in: [elements/geometry/BoxGeometry.ts:7](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/geometry/BoxGeometry.ts#L7)

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)[]

Defined in: [scene/contracts/Entity.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/scene/contracts/Entity.ts#L9)

##### Returns

readonly [`Entity`](Entity.md)[]

#### Inherited from

[`Geometry`](Geometry.md).[`attached`](Geometry.md#attached)

***

### indexCount

#### Get Signature

> **get** **indexCount**(): `number`

Defined in: [elements/geometry/BoxGeometry.ts:37](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/geometry/BoxGeometry.ts#L37)

##### Returns

`number`

#### Overrides

[`Geometry`](Geometry.md).[`indexCount`](Geometry.md#indexcount)

***

### vertexCount

#### Get Signature

> **get** **vertexCount**(): `number`

Defined in: [elements/geometry/BoxGeometry.ts:36](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/geometry/BoxGeometry.ts#L36)

##### Returns

`number`

#### Overrides

[`Geometry`](Geometry.md).[`vertexCount`](Geometry.md#vertexcount)

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

[`Geometry`](Geometry.md).[`add`](Geometry.md#add)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/geometry/BoxGeometry.ts:29](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/geometry/BoxGeometry.ts#L29)

#### Returns

readonly `GPUDescriptor`[]

#### Overrides

[`Geometry`](Geometry.md).[`getDescriptors`](Geometry.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/geometry/Geometry.ts:13](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/geometry/Geometry.ts#L13)

#### Returns

readonly `PipelineDescriptor`[]

#### Inherited from

[`Geometry`](Geometry.md).[`getPipelineDescriptors`](Geometry.md#getpipelinedescriptors)
