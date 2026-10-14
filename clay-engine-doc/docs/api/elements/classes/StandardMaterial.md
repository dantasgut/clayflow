[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / StandardMaterial

# Class: StandardMaterial

Defined in: [elements/material/StandardMaterial.ts:25](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/material/StandardMaterial.ts#L25)

Material PBR padrão — albedo + metallic-roughness. Renderizado pelo
`forward.wgsl` (BRDF Cook-Torrance simplificado).

## Extends

- [`Material`](Material.md)\<[`StandardMaterialData`](../interfaces/StandardMaterialData.md)\>

## Constructors

### Constructor

> **new StandardMaterial**(`values?`): `StandardMaterial`

Defined in: [elements/material/StandardMaterial.ts:29](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/material/StandardMaterial.ts#L29)

#### Parameters

##### values?

`Partial`\<[`StandardMaterialData`](../interfaces/StandardMaterialData.md)\> = `{}`

#### Returns

`StandardMaterial`

#### Overrides

[`Material`](Material.md).[`constructor`](Material.md#constructor)

## Properties

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/material/Material.ts:15](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/material/Material.ts#L15)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`Material`](Material.md).[`state`](Material.md#state)

***

### schema

> `readonly` `static` **schema**: `StructSchema` = `StandardMaterialSchema`

Defined in: [elements/material/StandardMaterial.ts:27](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/material/StandardMaterial.ts#L27)

StructSchema do StandardMaterial (albedo + roughness + metallic).

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)\<`object`\>[]

Defined in: [scene/contracts/Entity.ts:138](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/scene/contracts/Entity.ts#L138)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](Entity.md)\<`object`\>[]

#### Inherited from

[`Material`](Material.md).[`attached`](Material.md#attached)

***

### castsShadow

#### Get Signature

> **get** **castsShadow**(): `boolean`

Defined in: [elements/material/Material.ts:30](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/material/Material.ts#L30)

Projeta sombra? Padrão: só triângulos (linhas e sprites não projetam). Atribuir antes de inserir na cena: a
escolha entra nos grupos de desenho na inserção.

##### Returns

`boolean`

#### Set Signature

> **set** **castsShadow**(`value`): `void`

Defined in: [elements/material/Material.ts:35](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/material/Material.ts#L35)

Define se o material projeta sombra (vale sobre o padrão da topologia).

##### Parameters

###### value

`boolean`

##### Returns

`void`

#### Inherited from

[`Material`](Material.md).[`castsShadow`](Material.md#castsshadow)

***

### data

#### Get Signature

> **get** **data**(): `TData`

Defined in: [scene/contracts/Entity.ts:90](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/scene/contracts/Entity.ts#L90)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`TData`

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [scene/contracts/Entity.ts:96](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/scene/contracts/Entity.ts#L96)

Troca o dado inteiro; na cena, o recurso inteiro é marcado para envio.

##### Parameters

###### next

`TData`

##### Returns

`void`

#### Inherited from

[`Material`](Material.md).[`data`](Material.md#data)

***

### rawData

#### Get Signature

> **get** `protected` **rawData**(): `Readonly`\<`TData`\>

Defined in: [scene/contracts/Entity.ts:110](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/scene/contracts/Entity.ts#L110)

O dado cru, sem o proxy reativo — para leituras do próprio Resource (ex.: uma propriedade derivada consultada pelos
estágios) que não devem criar proxies aninhados. Escrever por aqui não marca o recurso.

##### Returns

`Readonly`\<`TData`\>

#### Inherited from

[`Material`](Material.md).[`rawData`](Material.md#rawdata)

***

### topology

#### Get Signature

> **get** **topology**(): `GPUPrimitiveTopology`

Defined in: [elements/material/Material.ts:22](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/material/Material.ts#L22)

Topologia do desenho: a do descritor de pipeline do material (padrão `'triangle-list'`).

##### Returns

`GPUPrimitiveTopology`

#### Inherited from

[`Material`](Material.md).[`topology`](Material.md#topology)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:118](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/scene/contracts/Entity.ts#L118)

Anexa uma Entity-filha. Retorna `this` para chaining fluente.
Não valida ciclos nem múltiplos pais — responsabilidade do caller.

#### Parameters

##### e

[`Entity`](Entity.md)\<`object`\>

#### Returns

`this`

#### Inherited from

[`Material`](Material.md).[`add`](Material.md#add)

***

### detach()

> **detach**(`e`): `boolean`

Defined in: [scene/contracts/Entity.ts:127](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/scene/contracts/Entity.ts#L127)

Desanexa uma Entity-filha direta (inverso de `add`). Devolve `false` se ela não é filha desta. Numa entidade já
inserida, use `World.detach` (que também atualiza a cena).

#### Parameters

##### e

[`Entity`](Entity.md)\<`object`\>

#### Returns

`boolean`

#### Inherited from

[`Material`](Material.md).[`detach`](Material.md#detach)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/material/StandardMaterial.ts:40](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/material/StandardMaterial.ts#L40)

Lista de bindings GPU (uniform/storage buffers, texturas, samplers)
que este resource expõe ao `ResourceSystem`. Cada descriptor define
`id`, `role`, `schema` (StructSchema) e opcionalmente `storage`
(`'pool'` para coalescer N members do mesmo schema em 1 buffer).

#### Returns

readonly `GPUDescriptor`[]

#### Overrides

[`Material`](Material.md).[`getDescriptors`](Material.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/material/StandardMaterial.ts:51](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/material/StandardMaterial.ts#L51)

Pipelines GPU declaradas pelo resource (shader source + entry points
+ consumes). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly `PipelineDescriptor`[]

#### Overrides

[`Material`](Material.md).[`getPipelineDescriptors`](Material.md#getpipelinedescriptors)
