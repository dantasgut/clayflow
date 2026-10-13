[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / FluidBody

# Class: FluidBody

Defined in: [elements/physics/bodies/FluidBody.ts:57](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/physics/bodies/FluidBody.ts#L57)

FluidBody — partícula de fluido (water, smoke, gel). Data class pura
governada pelo `schema`. Pool key = `schema.name` roteia para
SPHFlow/PBFFlow/MPMFlow.

 - **Domínio**: `new FluidBody({ algorithm: 'SPH', position, velocity })`.
 - **Cru** (avançado): `new FluidBody({ schema, data })`.

## Extends

- [`PhysicsBody`](PhysicsBody.md)

## Constructors

### Constructor

> **new FluidBody**(`options`): `FluidBody`

Defined in: [elements/physics/bodies/FluidBody.ts:60](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/physics/bodies/FluidBody.ts#L60)

#### Parameters

##### options

[`FluidBodyOptions`](../type-aliases/FluidBodyOptions.md)

#### Returns

`FluidBody`

#### Overrides

[`PhysicsBody`](PhysicsBody.md).[`constructor`](PhysicsBody.md#constructor)

## Properties

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/physics/bodies/PhysicsBody.ts:19](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/physics/bodies/PhysicsBody.ts#L19)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`state`](PhysicsBody.md#state)

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)\<`object`\>[]

Defined in: [scene/contracts/Entity.ts:127](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/scene/contracts/Entity.ts#L127)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](Entity.md)\<`object`\>[]

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`attached`](PhysicsBody.md#attached)

***

### data

#### Get Signature

> **get** **data**(): `TData`

Defined in: [scene/contracts/Entity.ts:90](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/scene/contracts/Entity.ts#L90)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`TData`

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [scene/contracts/Entity.ts:96](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/scene/contracts/Entity.ts#L96)

Troca o dado inteiro; na cena, o recurso inteiro é marcado para envio.

##### Parameters

###### next

`TData`

##### Returns

`void`

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`data`](PhysicsBody.md#data)

***

### rawData

#### Get Signature

> **get** `protected` **rawData**(): `Readonly`\<`TData`\>

Defined in: [scene/contracts/Entity.ts:110](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/scene/contracts/Entity.ts#L110)

O dado cru, sem o proxy reativo — para leituras do próprio Resource (ex.: uma propriedade derivada consultada pelos
estágios) que não devem criar proxies aninhados. Escrever por aqui não marca o recurso.

##### Returns

`Readonly`\<`TData`\>

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`rawData`](PhysicsBody.md#rawdata)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:118](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/scene/contracts/Entity.ts#L118)

Anexa uma Entity-filha. Retorna `this` para chaining fluente.
Não valida ciclos nem múltiplos pais — responsabilidade do caller.

#### Parameters

##### e

[`Entity`](Entity.md)\<`object`\>

#### Returns

`this`

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`add`](PhysicsBody.md#add)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/physics/bodies/FluidBody.ts:85](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/physics/bodies/FluidBody.ts#L85)

Pool storage para coalescer N FluidBodies do mesmo schema em 1 buffer GPU.

#### Returns

readonly `GPUDescriptor`[]

#### Overrides

[`PhysicsBody`](PhysicsBody.md).[`getDescriptors`](PhysicsBody.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/physics/bodies/PhysicsBody.ts:23](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/physics/bodies/PhysicsBody.ts#L23)

Pipelines GPU declaradas pelo resource (shader source + entry points
+ consumes). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly `PipelineDescriptor`[]

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`getPipelineDescriptors`](PhysicsBody.md#getpipelinedescriptors)
