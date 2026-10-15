[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ComputeParticleEmitter

# Class: ComputeParticleEmitter

Defined in: [elements/particles/ComputeParticleEmitter.ts:14](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/particles/ComputeParticleEmitter.ts#L14)

Emissor cuja simulação roda inteira na GPU (spec 009): o `EmitterFlow` cria `rate` partículas por segundo (contadas a
cada passo da física), integra gravidade e campos e mata as que passam de `lifetime`, num anel de `maxParticles`.
A criação é a forma do emissor (`shape`: ponto, esfera ou cone; padrão ponto na origem) ou uma `EmitFunction`
anexada; `seed` muda o sorteio. Desenho: uma `PointCloudGeometry` com `maxPoints = maxParticles` na mesma entidade
(os vértices são escritos pelo estágio) com um material de pontos.

## Extends

- [`ParticleEmitter`](ParticleEmitter.md)

## Constructors

### Constructor

> **new ComputeParticleEmitter**(`options?`): `ComputeParticleEmitter`

Defined in: [elements/particles/ComputeParticleEmitter.ts:23](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/particles/ComputeParticleEmitter.ts#L23)

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

Defined in: [elements/particles/ParticleEmitter.ts:46](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/particles/ParticleEmitter.ts#L46)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`state`](ParticleEmitter.md#state)

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/particles/ComputeParticleEmitter.ts:16](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/particles/ComputeParticleEmitter.ts#L16)

StructSchema da partícula compute (position + velocity + ageAndLife + params).

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)\<`object`\>[]

Defined in: [scene/contracts/Entity.ts:138](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/Entity.ts#L138)

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

Defined in: [scene/contracts/Entity.ts:90](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/Entity.ts#L90)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`TData`

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [scene/contracts/Entity.ts:96](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/Entity.ts#L96)

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

Defined in: [scene/contracts/Entity.ts:110](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/Entity.ts#L110)

O dado cru, sem o proxy reativo — para leituras do próprio Resource (ex.: uma propriedade derivada consultada pelos
estágios) que não devem criar proxies aninhados. Escrever por aqui não marca o recurso.

##### Returns

`Readonly`\<`TData`\>

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`rawData`](ParticleEmitter.md#rawdata)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:118](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/Entity.ts#L118)

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

### detach()

> **detach**(`e`): `boolean`

Defined in: [scene/contracts/Entity.ts:127](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/Entity.ts#L127)

Desanexa uma Entity-filha direta (inverso de `add`). Devolve `false` se ela não é filha desta. Numa entidade já
inserida, use `World.detach` (que também atualiza a cena).

#### Parameters

##### e

[`Entity`](Entity.md)\<`object`\>

#### Returns

`boolean`

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`detach`](ParticleEmitter.md#detach)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/particles/ComputeParticleEmitter.ts:27](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/particles/ComputeParticleEmitter.ts#L27)

Subclasses declaram pool de partículas + buffers auxiliares (life, velocity).

#### Returns

readonly `GPUDescriptor`[]

#### Overrides

[`ParticleEmitter`](ParticleEmitter.md).[`getDescriptors`](ParticleEmitter.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/particles/ParticleEmitter.ts:63](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/particles/ParticleEmitter.ts#L63)

Sem pipelines próprios — flow consumidor cria.

#### Returns

readonly `PipelineDescriptor`[]

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`getPipelineDescriptors`](ParticleEmitter.md#getpipelinedescriptors)
