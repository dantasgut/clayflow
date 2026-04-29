[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / MPMBody

# Class: MPMBody

Defined in: [elements/physics/bodies/MPMBody.ts:18](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/MPMBody.ts#L18)

Partícula MPM. Schema TS casa byte-a-byte com `MPMParticle` em
`gpu/wgsl/structs/mpm_particle.wgsl` (8 vec4f = 128 bytes).

  pos:    xyz=posição, w=mass
  vel:    xyz=velocidade, w=V0_p (volume de repouso)
  F_col0: coluna 0 de F (gradiente de deformação), w=det(F) cacheado
  F_col1: coluna 1, w=material_id override
  F_col2: coluna 2, w=padding
  C_col*: coluna 0/1/2 de C (APIC affine momentum matrix)

## Extends

- [`PhysicsBody`](PhysicsBody.md)

## Constructors

### Constructor

> **new MPMBody**(`values?`): `MPMBody`

Defined in: [elements/physics/bodies/MPMBody.ts:30](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/MPMBody.ts#L30)

#### Parameters

##### values?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`MPMBody`

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

Defined in: [elements/physics/bodies/MPMBody.ts:19](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/MPMBody.ts#L19)

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

Defined in: [elements/physics/bodies/MPMBody.ts:49](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/MPMBody.ts#L49)

#### Returns

readonly `GPUDescriptor`[]

#### Overrides

[`PhysicsBody`](PhysicsBody.md).[`getDescriptors`](PhysicsBody.md#getdescriptors)

***

### getFlowDescriptors()

> **getFlowDescriptors**(): readonly `FlowDescriptor`[]

Defined in: [elements/physics/bodies/MPMBody.ts:58](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/physics/bodies/MPMBody.ts#L58)

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
