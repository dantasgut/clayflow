[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ScriptedParticleEmitter

# Class: ScriptedParticleEmitter

Defined in: [elements/particles/ScriptedParticleEmitter.ts:12](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/particles/ScriptedParticleEmitter.ts#L12)

Emitter cuja simulação roda em CPU (TS) — atualiza pos/vel/age via
callback do app. Útil para efeitos com poucas partículas e lógica
complexa (logo, prefer ComputeParticleEmitter para 10k+ particles).

## Extends

- [`ParticleEmitter`](ParticleEmitter.md)

## Constructors

### Constructor

> **new ScriptedParticleEmitter**(`options?`): `ScriptedParticleEmitter`

Defined in: [elements/particles/ScriptedParticleEmitter.ts:20](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/particles/ScriptedParticleEmitter.ts#L20)

#### Parameters

##### options?

[`ParticleEmitterOptions`](../interfaces/ParticleEmitterOptions.md) = `{}`

#### Returns

`ScriptedParticleEmitter`

#### Overrides

[`ParticleEmitter`](ParticleEmitter.md).[`constructor`](ParticleEmitter.md#constructor)

## Properties

### data

> **data**: `Record`\<`string`, `unknown`\> = `{}`

Defined in: [elements/particles/ParticleEmitter.ts:31](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/particles/ParticleEmitter.ts#L31)

Dados runtime do resource (e.g. Camera position, Material albedo,
RigidBody mass). Schema é declarado em `getDescriptors()[i].schema`.
Mutações devem disparar evento `resourceDirty` para re-upload.

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`data`](ParticleEmitter.md#data)

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/particles/ParticleEmitter.ts:30](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/particles/ParticleEmitter.ts#L30)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`state`](ParticleEmitter.md#state)

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/particles/ScriptedParticleEmitter.ts:14](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/particles/ScriptedParticleEmitter.ts#L14)

StructSchema da partícula scripted (position + velocity + ageAndLife).

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)[]

Defined in: [scene/contracts/Entity.ts:41](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/scene/contracts/Entity.ts#L41)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](Entity.md)[]

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`attached`](ParticleEmitter.md#attached)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:32](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/scene/contracts/Entity.ts#L32)

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

Defined in: [elements/particles/ScriptedParticleEmitter.ts:24](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/particles/ScriptedParticleEmitter.ts#L24)

Subclasses declaram pool de partículas + buffers auxiliares (life, velocity).

#### Returns

readonly `GPUDescriptor`[]

#### Overrides

[`ParticleEmitter`](ParticleEmitter.md).[`getDescriptors`](ParticleEmitter.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/particles/ParticleEmitter.ts:47](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/particles/ParticleEmitter.ts#L47)

Sem pipelines próprios — flow consumidor cria.

#### Returns

readonly `PipelineDescriptor`[]

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`getPipelineDescriptors`](ParticleEmitter.md#getpipelinedescriptors)
