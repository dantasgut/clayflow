[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / Light

# Abstract Class: Light

Defined in: [elements/scene/Light.ts:16](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/scene/Light.ts#L16)

Light é a base de todos os tipos de luz (DirectionalLight, PointLight,
SpotLight). Compartilham um struct comum coalescível em pool — múltiplas
lights são lidas simultaneamente por shaders no fragment stage.

`kind` enum interno: 0 = directional, 1 = point, 2 = spot.

## Extends

- [`Entity`](Entity.md)

## Extended by

- [`DirectionalLight`](DirectionalLight.md)
- [`PointLight`](PointLight.md)

## Implements

- `Resource`

## Constructors

### Constructor

> **new Light**(): `Light`

#### Returns

`Light`

#### Inherited from

[`Entity`](Entity.md).[`constructor`](Entity.md#constructor)

## Properties

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/scene/Light.ts:28](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/scene/Light.ts#L28)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

`Resource.state`

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/scene/Light.ts:18](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/scene/Light.ts#L18)

Schema unified — todos os tipos de light usam o mesmo layout.

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

[`Entity`](Entity.md).[`attached`](Entity.md#attached)

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

#### Implementation of

`Resource.data`

#### Inherited from

[`Entity`](Entity.md).[`data`](Entity.md#data)

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

[`Entity`](Entity.md).[`rawData`](Entity.md#rawdata)

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

[`Entity`](Entity.md).[`add`](Entity.md#add)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/scene/Light.ts:31](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/scene/Light.ts#L31)

Pool storage read-only — fragment shaders iteram sobre o array de lights.

#### Returns

readonly `GPUDescriptor`[]

#### Implementation of

`Resource.getDescriptors`

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/scene/Light.ts:43](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/scene/Light.ts#L43)

Sem pipelines próprios — Light é dado, ForwardFlow é quem itera.

#### Returns

readonly `PipelineDescriptor`[]

#### Implementation of

`Resource.getPipelineDescriptors`
