[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ComputeParticleEmitter

# Class: ComputeParticleEmitter

Defined in: [elements/particles/ComputeParticleEmitter.ts:11](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/particles/ComputeParticleEmitter.ts#L11)

Emitter cuja simulação roda inteiramente em compute shader GPU.
Apropriado para 10k+ partículas com lógica simples (gravity + drag).

## Extends

- [`ParticleEmitter`](ParticleEmitter.md)

## Constructors

### Constructor

> **new ComputeParticleEmitter**(`options?`): `ComputeParticleEmitter`

Defined in: [elements/particles/ComputeParticleEmitter.ts:20](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/particles/ComputeParticleEmitter.ts#L20)

#### Parameters

##### options?

[`ParticleEmitterOptions`](../interfaces/ParticleEmitterOptions.md) = `{}`

#### Returns

`ComputeParticleEmitter`

#### Overrides

[`ParticleEmitter`](ParticleEmitter.md).[`constructor`](ParticleEmitter.md#constructor)

## Properties

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/particles/ParticleEmitter.ts:30](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/particles/ParticleEmitter.ts#L30)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`state`](ParticleEmitter.md#state)

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/particles/ComputeParticleEmitter.ts:13](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/particles/ComputeParticleEmitter.ts#L13)

StructSchema da partícula compute (position + velocity + ageAndLife + params).

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)[]

Defined in: [scene/contracts/Entity.ts:125](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/scene/contracts/Entity.ts#L125)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](Entity.md)[]

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`attached`](ParticleEmitter.md#attached)

***

### data

#### Get Signature

> **get** **data**(): `Record`\<`string`, `unknown`\>

Defined in: [scene/contracts/Entity.ts:88](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/scene/contracts/Entity.ts#L88)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`Record`\<`string`, `unknown`\>

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [scene/contracts/Entity.ts:94](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/scene/contracts/Entity.ts#L94)

Troca o dado inteiro; na cena, o recurso inteiro é marcado para envio.

##### Parameters

###### next

`Record`\<`string`, `unknown`\>

##### Returns

`void`

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`data`](ParticleEmitter.md#data)

***

### rawData

#### Get Signature

> **get** `protected` **rawData**(): `Readonly`\<`Record`\<`string`, `unknown`\>\>

Defined in: [scene/contracts/Entity.ts:108](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/scene/contracts/Entity.ts#L108)

O dado cru, sem o proxy reativo — para leituras do próprio Resource (ex.: uma propriedade derivada consultada pelos
estágios) que não devem criar proxies aninhados. Escrever por aqui não marca o recurso.

##### Returns

`Readonly`\<`Record`\<`string`, `unknown`\>\>

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`rawData`](ParticleEmitter.md#rawdata)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:116](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/scene/contracts/Entity.ts#L116)

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

Defined in: [elements/particles/ComputeParticleEmitter.ts:24](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/particles/ComputeParticleEmitter.ts#L24)

Subclasses declaram pool de partículas + buffers auxiliares (life, velocity).

#### Returns

readonly `GPUDescriptor`[]

#### Overrides

[`ParticleEmitter`](ParticleEmitter.md).[`getDescriptors`](ParticleEmitter.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/particles/ParticleEmitter.ts:46](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/particles/ParticleEmitter.ts#L46)

Sem pipelines próprios — flow consumidor cria.

#### Returns

readonly `PipelineDescriptor`[]

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`getPipelineDescriptors`](ParticleEmitter.md#getpipelinedescriptors)
