[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ParticleEmitter

# Abstract Class: ParticleEmitter

Defined in: [elements/particles/ParticleEmitter.ts:15](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/particles/ParticleEmitter.ts#L15)

## Extends

- [`Entity`](Entity.md)

## Extended by

- [`ScriptedParticleEmitter`](ScriptedParticleEmitter.md)
- [`ComputeParticleEmitter`](ComputeParticleEmitter.md)

## Implements

- `Resource`

## Constructors

### Constructor

> **new ParticleEmitter**(`options?`): `ParticleEmitter`

Defined in: [elements/particles/ParticleEmitter.ts:19](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/particles/ParticleEmitter.ts#L19)

#### Parameters

##### options?

[`ParticleEmitterOptions`](../interfaces/ParticleEmitterOptions.md) = `{}`

#### Returns

`ParticleEmitter`

#### Overrides

[`Entity`](Entity.md).[`constructor`](Entity.md#constructor)

## Properties

### data

> **data**: `Record`\<`string`, `unknown`\> = `{}`

Defined in: [elements/particles/ParticleEmitter.ts:17](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/particles/ParticleEmitter.ts#L17)

#### Implementation of

`Resource.data`

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/particles/ParticleEmitter.ts:16](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/particles/ParticleEmitter.ts#L16)

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

Defined in: [elements/particles/ParticleEmitter.ts:29](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/particles/ParticleEmitter.ts#L29)

#### Returns

readonly `GPUDescriptor`[]

#### Implementation of

`Resource.getDescriptors`

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/particles/ParticleEmitter.ts:31](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/particles/ParticleEmitter.ts#L31)

#### Returns

readonly `PipelineDescriptor`[]

#### Implementation of

`Resource.getPipelineDescriptors`
