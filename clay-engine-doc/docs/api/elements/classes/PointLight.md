[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / PointLight

# Class: PointLight

Defined in: [elements/scene/PointLight.ts:3](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/scene/PointLight.ts#L3)

Light é a base de todos os tipos de luz (DirectionalLight, PointLight,
SpotLight). Compartilham um struct comum coalescível em pool — múltiplas
lights são lidas simultaneamente por shaders no fragment stage.

`kind` enum interno: 0 = directional, 1 = point, 2 = spot.

## Extends

- [`Light`](Light.md)

## Constructors

### Constructor

> **new PointLight**(`values?`): `PointLight`

Defined in: [elements/scene/PointLight.ts:4](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/scene/PointLight.ts#L4)

#### Parameters

##### values?

[`LightValues`](../interfaces/LightValues.md) = `{}`

#### Returns

`PointLight`

#### Overrides

[`Light`](Light.md).[`constructor`](Light.md#constructor)

## Properties

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/scene/Light.ts:44](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/scene/Light.ts#L44)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`Light`](Light.md).[`state`](Light.md#state)

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/scene/Light.ts:34](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/scene/Light.ts#L34)

Schema unified — todos os tipos de light usam o mesmo layout.

#### Inherited from

[`Light`](Light.md).[`schema`](Light.md#schema)

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

[`Light`](Light.md).[`attached`](Light.md#attached)

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

[`Light`](Light.md).[`data`](Light.md#data)

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

[`Light`](Light.md).[`rawData`](Light.md#rawdata)

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

[`Light`](Light.md).[`add`](Light.md#add)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/scene/Light.ts:47](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/scene/Light.ts#L47)

Pool storage read-only — fragment shaders iteram sobre o array de lights.

#### Returns

readonly `GPUDescriptor`[]

#### Inherited from

[`Light`](Light.md).[`getDescriptors`](Light.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/scene/Light.ts:59](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/scene/Light.ts#L59)

Sem pipelines próprios — Light é dado, ForwardFlow é quem itera.

#### Returns

readonly `PipelineDescriptor`[]

#### Inherited from

[`Light`](Light.md).[`getPipelineDescriptors`](Light.md#getpipelinedescriptors)
