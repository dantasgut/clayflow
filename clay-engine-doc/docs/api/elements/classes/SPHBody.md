[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SPHBody

# Class: SPHBody

Defined in: [elements/physics/bodies/SPHBody.ts:16](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/SPHBody.ts#L16)

Partícula SPH (WCSPH). Schema TS casa byte-a-byte com `SPHParticle` em
`gpu/wgsl/structs/sph_particle.wgsl` (4 vec4f = 64 bytes).

  pos:   xyz=posição, w=density
  vel:   xyz=velocity, w=pressure
  force: xyz=force,    w=pad
  color: xyz=XSPH velocity correction, w=pad

## Extends

- [`PhysicsBody`](PhysicsBody.md)

## Constructors

### Constructor

> **new SPHBody**(`values?`): `SPHBody`

Defined in: [elements/physics/bodies/SPHBody.ts:24](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/SPHBody.ts#L24)

#### Parameters

##### values?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`SPHBody`

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

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/physics/bodies/SPHBody.ts:17](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/SPHBody.ts#L17)

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

Defined in: [elements/physics/bodies/SPHBody.ts:37](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/SPHBody.ts#L37)

#### Returns

readonly `GPUDescriptor`[]

#### Overrides

[`PhysicsBody`](PhysicsBody.md).[`getDescriptors`](PhysicsBody.md#getdescriptors)

***

### getFlowDescriptors()

> **getFlowDescriptors**(): readonly `FlowDescriptor`[]

Defined in: [elements/physics/bodies/SPHBody.ts:46](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/SPHBody.ts#L46)

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
