[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ParametricSurfaceGeometry

# Class: ParametricSurfaceGeometry

Defined in: [elements/geometry/ParametricSurfaceGeometry.ts:4](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/geometry/ParametricSurfaceGeometry.ts#L4)

## Extends

- [`ParametricGeometry`](ParametricGeometry.md)

## Constructors

### Constructor

> **new ParametricSurfaceGeometry**(`fn`, `values?`): `ParametricSurfaceGeometry`

Defined in: [elements/geometry/ParametricSurfaceGeometry.ts:5](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/geometry/ParametricSurfaceGeometry.ts#L5)

#### Parameters

##### fn

[`ParametricFunction`](../type-aliases/ParametricFunction.md)

##### values?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`ParametricSurfaceGeometry`

#### Overrides

[`ParametricGeometry`](ParametricGeometry.md).[`constructor`](ParametricGeometry.md#constructor)

## Properties

### data

> **data**: `Record`\<`string`, `unknown`\> = `{}`

Defined in: [elements/geometry/Geometry.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/geometry/Geometry.ts#L9)

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`data`](ParametricGeometry.md#data)

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/geometry/Geometry.ts:8](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/geometry/Geometry.ts#L8)

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`state`](ParametricGeometry.md#state)

***

### schema

> `readonly` `static` **schema**: `StructSchema` = `ParametricGeometry.vertexStruct`

Defined in: [elements/geometry/ParametricGeometry.ts:14](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/geometry/ParametricGeometry.ts#L14)

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`schema`](ParametricGeometry.md#schema)

***

### vertexStruct

> `readonly` `static` **vertexStruct**: `StructSchema`

Defined in: [elements/geometry/ParametricGeometry.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/geometry/ParametricGeometry.ts#L9)

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`vertexStruct`](ParametricGeometry.md#vertexstruct)

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)[]

Defined in: [scene/contracts/Entity.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/scene/contracts/Entity.ts#L9)

##### Returns

readonly [`Entity`](Entity.md)[]

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`attached`](ParametricGeometry.md#attached)

***

### indexCount

#### Get Signature

> **get** **indexCount**(): `number`

Defined in: [elements/geometry/ParametricGeometry.ts:37](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/geometry/ParametricGeometry.ts#L37)

##### Returns

`number`

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`indexCount`](ParametricGeometry.md#indexcount)

***

### vertexCount

#### Get Signature

> **get** **vertexCount**(): `number`

Defined in: [elements/geometry/ParametricGeometry.ts:36](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/geometry/ParametricGeometry.ts#L36)

##### Returns

`number`

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`vertexCount`](ParametricGeometry.md#vertexcount)

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

[`ParametricGeometry`](ParametricGeometry.md).[`add`](ParametricGeometry.md#add)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/geometry/ParametricGeometry.ts:29](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/geometry/ParametricGeometry.ts#L29)

#### Returns

readonly `GPUDescriptor`[]

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`getDescriptors`](ParametricGeometry.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/geometry/Geometry.ts:13](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/geometry/Geometry.ts#L13)

#### Returns

readonly `PipelineDescriptor`[]

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`getPipelineDescriptors`](ParametricGeometry.md#getpipelinedescriptors)
