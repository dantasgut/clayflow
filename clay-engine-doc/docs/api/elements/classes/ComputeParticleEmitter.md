[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ComputeParticleEmitter

# Class: ComputeParticleEmitter

Defined in: [elements/particles/ComputeParticleEmitter.ts:11](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/particles/ComputeParticleEmitter.ts#L11)

Emitter cuja simulação roda inteiramente em compute shader GPU.
Apropriado para 10k+ partículas com lógica simples (gravity + drag).

## Extends

- [`ParticleEmitter`](ParticleEmitter.md)

## Constructors

### Constructor

> **new ComputeParticleEmitter**(`options?`): `ComputeParticleEmitter`

Defined in: [elements/particles/ComputeParticleEmitter.ts:20](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/particles/ComputeParticleEmitter.ts#L20)

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

Defined in: [elements/particles/ParticleEmitter.ts:42](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/particles/ParticleEmitter.ts#L42)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`state`](ParticleEmitter.md#state)

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/particles/ComputeParticleEmitter.ts:13](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/particles/ComputeParticleEmitter.ts#L13)

StructSchema da partícula compute (position + velocity + ageAndLife + params).

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)\<`object`\>[]

Defined in: [scene/contracts/Entity.ts:127](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/scene/contracts/Entity.ts#L127)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](Entity.md)\<`object`\>[]

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`attached`](ParticleEmitter.md#attached)

***

### data

#### Get Signature

> **get** **data**(): `TData`

Defined in: [scene/contracts/Entity.ts:90](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/scene/contracts/Entity.ts#L90)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`TData`

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [scene/contracts/Entity.ts:96](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/scene/contracts/Entity.ts#L96)

Troca o dado inteiro; na cena, o recurso inteiro é marcado para envio.

##### Parameters

###### next

`TData`

##### Returns

`void`

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`data`](ParticleEmitter.md#data)

***

### rawData

#### Get Signature

> **get** `protected` **rawData**(): `Readonly`\<`TData`\>

Defined in: [scene/contracts/Entity.ts:110](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/scene/contracts/Entity.ts#L110)

O dado cru, sem o proxy reativo — para leituras do próprio Resource (ex.: uma propriedade derivada consultada pelos
estágios) que não devem criar proxies aninhados. Escrever por aqui não marca o recurso.

##### Returns

`Readonly`\<`TData`\>

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`rawData`](ParticleEmitter.md#rawdata)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:118](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/scene/contracts/Entity.ts#L118)

Anexa uma Entity-filha. Retorna `this` para chaining fluente.
Não valida ciclos nem múltiplos pais — responsabilidade do caller.

#### Parameters

##### e

[`Entity`](Entity.md)\<`object`\>

#### Returns

`this`

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`add`](ParticleEmitter.md#add)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/particles/ComputeParticleEmitter.ts:24](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/particles/ComputeParticleEmitter.ts#L24)

Subclasses declaram pool de partículas + buffers auxiliares (life, velocity).

#### Returns

readonly `GPUDescriptor`[]

#### Overrides

[`ParticleEmitter`](ParticleEmitter.md).[`getDescriptors`](ParticleEmitter.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/particles/ParticleEmitter.ts:58](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/particles/ParticleEmitter.ts#L58)

Sem pipelines próprios — flow consumidor cria.

#### Returns

readonly `PipelineDescriptor`[]

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`getPipelineDescriptors`](ParticleEmitter.md#getpipelinedescriptors)
