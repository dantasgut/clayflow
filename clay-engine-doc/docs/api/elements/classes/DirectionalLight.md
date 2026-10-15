[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / DirectionalLight

# Class: DirectionalLight

Defined in: [elements/scene/DirectionalLight.ts:8](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/scene/DirectionalLight.ts#L8)

Luz direcional (sol): direção, cor e intensidade. Com `castShadow: true`, anexa o seu `ShadowMap` (matriz da luz,
vieses e a textura de profundidade), que o estágio de sombra preenche e o render principal amostra.

## Extends

- [`Light`](Light.md)

## Constructors

### Constructor

> **new DirectionalLight**(`values?`): `DirectionalLight`

Defined in: [elements/scene/DirectionalLight.ts:12](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/scene/DirectionalLight.ts#L12)

#### Parameters

##### values?

[`LightValues`](../interfaces/LightValues.md) & `object` = `{}`

#### Returns

`DirectionalLight`

#### Overrides

[`Light`](Light.md).[`constructor`](Light.md#constructor)

## Properties

### shadowMap

> `readonly` **shadowMap**: [`ShadowMap`](ShadowMap.md) \| `undefined`

Defined in: [elements/scene/DirectionalLight.ts:10](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/scene/DirectionalLight.ts#L10)

O mapa de sombra anexado (só com `castShadow: true`).

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/scene/Light.ts:52](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/scene/Light.ts#L52)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`Light`](Light.md).[`state`](Light.md#state)

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/scene/Light.ts:42](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/scene/Light.ts#L42)

Schema unified — todos os tipos de light usam o mesmo layout.

#### Inherited from

[`Light`](Light.md).[`schema`](Light.md#schema)

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)\<`object`\>[]

Defined in: [scene/contracts/Entity.ts:138](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/contracts/Entity.ts#L138)

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

Defined in: [scene/contracts/Entity.ts:90](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/contracts/Entity.ts#L90)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`TData`

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [scene/contracts/Entity.ts:96](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/contracts/Entity.ts#L96)

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

Defined in: [scene/contracts/Entity.ts:110](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/contracts/Entity.ts#L110)

O dado cru, sem o proxy reativo — para leituras do próprio Resource (ex.: uma propriedade derivada consultada pelos
estágios) que não devem criar proxies aninhados. Escrever por aqui não marca o recurso.

##### Returns

`Readonly`\<`TData`\>

#### Inherited from

[`Light`](Light.md).[`rawData`](Light.md#rawdata)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:118](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/contracts/Entity.ts#L118)

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

### detach()

> **detach**(`e`): `boolean`

Defined in: [scene/contracts/Entity.ts:127](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/contracts/Entity.ts#L127)

Desanexa uma Entity-filha direta (inverso de `add`). Devolve `false` se ela não é filha desta. Numa entidade já
inserida, use `World.detach` (que também atualiza a cena).

#### Parameters

##### e

[`Entity`](Entity.md)\<`object`\>

#### Returns

`boolean`

#### Inherited from

[`Light`](Light.md).[`detach`](Light.md#detach)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/scene/Light.ts:55](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/scene/Light.ts#L55)

Pool storage read-only — fragment shaders iteram sobre o array de lights.

#### Returns

readonly `GPUDescriptor`[]

#### Inherited from

[`Light`](Light.md).[`getDescriptors`](Light.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/scene/Light.ts:67](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/scene/Light.ts#L67)

Sem pipelines próprios — Light é dado, ForwardFlow é quem itera.

#### Returns

readonly `PipelineDescriptor`[]

#### Inherited from

[`Light`](Light.md).[`getPipelineDescriptors`](Light.md#getpipelinedescriptors)
