[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ComputeParticleEmitter

# Class: ComputeParticleEmitter

Defined in: [elements/particles/ComputeParticleEmitter.ts:11](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/particles/ComputeParticleEmitter.ts#L11)

Emitter cuja simulação roda inteiramente em compute shader GPU.
Apropriado para 10k+ partículas com lógica simples (gravity + drag).

## Extends

- [`ParticleEmitter`](ParticleEmitter.md)

## Constructors

### Constructor

> **new ComputeParticleEmitter**(`options?`): `ComputeParticleEmitter`

Defined in: [elements/particles/ComputeParticleEmitter.ts:20](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/particles/ComputeParticleEmitter.ts#L20)

#### Parameters

##### options?

[`ParticleEmitterOptions`](../interfaces/ParticleEmitterOptions.md) = `{}`

#### Returns

`ComputeParticleEmitter`

#### Overrides

[`ParticleEmitter`](ParticleEmitter.md).[`constructor`](ParticleEmitter.md#constructor)

## Properties

### data

> **data**: `Record`\<`string`, `unknown`\> = `{}`

Defined in: [elements/particles/ParticleEmitter.ts:31](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/particles/ParticleEmitter.ts#L31)

Dados runtime do resource (e.g. Camera position, Material albedo,
RigidBody mass). Schema é declarado em `getDescriptors()[i].schema`.
Mutações devem disparar evento `resourceDirty` para re-upload.

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`data`](ParticleEmitter.md#data)

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/particles/ParticleEmitter.ts:30](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/particles/ParticleEmitter.ts#L30)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`state`](ParticleEmitter.md#state)

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/particles/ComputeParticleEmitter.ts:13](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/particles/ComputeParticleEmitter.ts#L13)

StructSchema da partícula compute (position + velocity + ageAndLife + params).

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)[]

Defined in: [scene/contracts/Entity.ts:41](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/scene/contracts/Entity.ts#L41)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](Entity.md)[]

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`attached`](ParticleEmitter.md#attached)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:32](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/scene/contracts/Entity.ts#L32)

Anexa uma Entity-filha. Retorna `this` para chaining fluente.
Não valida ciclos nem múltiplos pais — responsabilidade do caller.

#### Parameters

##### e

[`Entity`](Entity.md)

#### Returns

`this`

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`add`](ParticleEmitter.md#add)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/particles/ComputeParticleEmitter.ts:24](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/particles/ComputeParticleEmitter.ts#L24)

Subclasses declaram pool de partículas + buffers auxiliares (life, velocity).

#### Returns

readonly `GPUDescriptor`[]

#### Overrides

[`ParticleEmitter`](ParticleEmitter.md).[`getDescriptors`](ParticleEmitter.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/particles/ParticleEmitter.ts:47](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/particles/ParticleEmitter.ts#L47)

Sem pipelines próprios — flow consumidor cria.

#### Returns

readonly `PipelineDescriptor`[]

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`getPipelineDescriptors`](ParticleEmitter.md#getpipelinedescriptors)
