[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / ParticleEmitter

# Abstract Class: ParticleEmitter

Defined in: [src/elements/particles/ParticleEmitter.ts:45](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/particles/ParticleEmitter.ts#L45)

ParticleEmitter é a base de emissores de partículas. Subclasses concretas:
  - `ComputeParticleEmitter`: emissão e simulação inteiramente em compute shaders.
  - `ScriptedParticleEmitter`: emissão CPU-driven (callback custom por partícula).

## Extends

- [`Entity`](Entity.md)\<[`ParticleEmitterData`](../interfaces/ParticleEmitterData.md)\>

## Extended by

- [`ScriptedParticleEmitter`](ScriptedParticleEmitter.md)
- [`ComputeParticleEmitter`](ComputeParticleEmitter.md)

## Implements

- [`Resource`](../../platform/web/interfaces/Resource.md)

## Constructors

### Constructor

> **new ParticleEmitter**(`options?`): `ParticleEmitter`

Defined in: [src/elements/particles/ParticleEmitter.ts:48](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/particles/ParticleEmitter.ts#L48)

#### Parameters

##### options?

[`ParticleEmitterOptions`](../interfaces/ParticleEmitterOptions.md) = `{}`

#### Returns

`ParticleEmitter`

#### Overrides

[`Entity`](Entity.md).[`constructor`](Entity.md#constructor)

## Properties

### state

> **state**: [`ResourceState`](../../platform/web/enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [src/elements/particles/ParticleEmitter.ts:46](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/particles/ParticleEmitter.ts#L46)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`state`](../../platform/web/interfaces/Resource.md#state)

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)\<`object`\>[]

Defined in: [src/scene/contracts/Entity.ts:160](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L160)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](Entity.md)\<`object`\>[]

#### Inherited from

[`Entity`](Entity.md).[`attached`](Entity.md#attached)

***

### data

#### Get Signature

> **get** **data**(): `TData`

Defined in: [src/scene/contracts/Entity.ts:97](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L97)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`TData`

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [src/scene/contracts/Entity.ts:103](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L103)

Troca o dado inteiro; na cena, o recurso inteiro é marcado para envio.

##### Parameters

###### next

`TData`

##### Returns

`void`

Dados runtime do resource (e.g. Camera position, Material albedo,
RigidBody mass). Schema é declarado em `getDescriptors()[i].schema`.
Mutações devem disparar evento `resourceDirty` para re-upload. O tipo
concreto vem do parâmetro de `Entity<TData>`; o motor lê os campos pelo
schema.

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`data`](../../platform/web/interfaces/Resource.md#data)

#### Inherited from

[`Entity`](Entity.md).[`data`](Entity.md#data)

***

### rawData

#### Get Signature

> **get** `protected` **rawData**(): `Readonly`\<`TData`\>

Defined in: [src/scene/contracts/Entity.ts:117](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L117)

O dado cru, sem o proxy reativo — para leituras do próprio Resource (ex.: uma propriedade derivada consultada pelos
estágios) que não devem criar proxies aninhados. Escrever por aqui não marca o recurso.

##### Returns

`Readonly`\<`TData`\>

#### Inherited from

[`Entity`](Entity.md).[`rawData`](Entity.md#rawdata)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [src/scene/contracts/Entity.ts:140](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L140)

Anexa uma Entity-filha. Retorna `this` para chaining fluente.
Não valida ciclos nem múltiplos pais — responsabilidade do caller.

#### Parameters

##### e

[`Entity`](Entity.md)\<`object`\>

#### Returns

`this`

#### Inherited from

[`Entity`](Entity.md).[`add`](Entity.md#add)

***

### detach()

> **detach**(`e`): `boolean`

Defined in: [src/scene/contracts/Entity.ts:149](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L149)

Desanexa uma Entity-filha direta (inverso de `add`). Devolve `false` se ela não é filha desta. Numa entidade já
inserida, use `World.detach` (que também atualiza a cena).

#### Parameters

##### e

[`Entity`](Entity.md)\<`object`\>

#### Returns

`boolean`

#### Inherited from

[`Entity`](Entity.md).[`detach`](Entity.md#detach)

***

### getDescriptors()

> `abstract` **getDescriptors**(): readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

Defined in: [src/elements/particles/ParticleEmitter.ts:60](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/particles/ParticleEmitter.ts#L60)

Subclasses declaram pool de partículas + buffers auxiliares (life, velocity).

#### Returns

readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`getDescriptors`](../../platform/web/interfaces/Resource.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

Defined in: [src/elements/particles/ParticleEmitter.ts:63](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/particles/ParticleEmitter.ts#L63)

Sem pipelines próprios — flow consumidor cria.

#### Returns

readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`getPipelineDescriptors`](../../platform/web/interfaces/Resource.md#getpipelinedescriptors)

***

### redescribe()

> `protected` **redescribe**(`previous`, `next`): `void`

Defined in: [src/scene/contracts/Entity.ts:127](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L127)

Troca o dado e os descritores em pool de uma vez — o Resource cujo layout depende do próprio dado (ex.: o registro
tipado de uma função de ponto quando a forma dos parâmetros muda; spec 031, R8). `getDescriptors()` já devolve os
novos; `previous` são os de antes. Fora da cena, só troca o dado; na cena, a C2 libera os slots nos pools antigos,
ocupa os dos novos com `next` e recompõe a entidade (`entitiesRecomposed`: registros e conjuntos dos estágios).

#### Parameters

##### previous

readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

##### next

[`ParticleEmitterData`](../interfaces/ParticleEmitterData.md)

#### Returns

`void`

#### Inherited from

[`Entity`](Entity.md).[`redescribe`](Entity.md#redescribe)
