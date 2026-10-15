[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / Material

# Abstract Class: Material\<TData\>

Defined in: [elements/material/Material.ts:11](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/material/Material.ts#L11)

Base dos materiais de render; `TData` tipa o `data` (ver `Entity`). O material decide como a geometria é desenhada
(spec 008): a `topology` do seu descritor de pipeline (triângulos, linhas ou pontos) e se projeta sombra.

## Extends

- [`Entity`](Entity.md)\<`TData`\>

## Extended by

- [`StandardMaterial`](StandardMaterial.md)
- [`WireframeMaterial`](WireframeMaterial.md)
- [`PointSpriteMaterial`](PointSpriteMaterial.md)
- [`FluidSurfaceMaterial`](FluidSurfaceMaterial.md)

## Type Parameters

### TData

`TData` *extends* `object` = `Record`\<`string`, `unknown`\>

## Implements

- `Resource`

## Constructors

### Constructor

> **new Material**\<`TData`\>(): `Material`\<`TData`\>

#### Returns

`Material`\<`TData`\>

#### Inherited from

[`Entity`](Entity.md).[`constructor`](Entity.md#constructor)

## Properties

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/material/Material.ts:15](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/material/Material.ts#L15)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

`Resource.state`

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)\<`object`\>[]

Defined in: [scene/contracts/Entity.ts:138](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/Entity.ts#L138)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](Entity.md)\<`object`\>[]

#### Inherited from

[`Entity`](Entity.md).[`attached`](Entity.md#attached)

***

### castsShadow

#### Get Signature

> **get** **castsShadow**(): `boolean`

Defined in: [elements/material/Material.ts:30](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/material/Material.ts#L30)

Projeta sombra? Padrão: só triângulos (linhas e sprites não projetam). Atribuir antes de inserir na cena: a
escolha entra nos grupos de desenho na inserção.

##### Returns

`boolean`

#### Set Signature

> **set** **castsShadow**(`value`): `void`

Defined in: [elements/material/Material.ts:35](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/material/Material.ts#L35)

Define se o material projeta sombra (vale sobre o padrão da topologia).

##### Parameters

###### value

`boolean`

##### Returns

`void`

***

### data

#### Get Signature

> **get** **data**(): `TData`

Defined in: [scene/contracts/Entity.ts:90](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/Entity.ts#L90)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`TData`

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [scene/contracts/Entity.ts:96](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/Entity.ts#L96)

Troca o dado inteiro; na cena, o recurso inteiro é marcado para envio.

##### Parameters

###### next

`TData`

##### Returns

`void`

#### Implementation of

`Resource.data`

#### Inherited from

[`Entity`](Entity.md).[`data`](Entity.md#data)

***

### rawData

#### Get Signature

> **get** `protected` **rawData**(): `Readonly`\<`TData`\>

Defined in: [scene/contracts/Entity.ts:110](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/Entity.ts#L110)

O dado cru, sem o proxy reativo — para leituras do próprio Resource (ex.: uma propriedade derivada consultada pelos
estágios) que não devem criar proxies aninhados. Escrever por aqui não marca o recurso.

##### Returns

`Readonly`\<`TData`\>

#### Inherited from

[`Entity`](Entity.md).[`rawData`](Entity.md#rawdata)

***

### topology

#### Get Signature

> **get** **topology**(): `GPUPrimitiveTopology`

Defined in: [elements/material/Material.ts:22](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/material/Material.ts#L22)

Topologia do desenho: a do descritor de pipeline do material (padrão `'triangle-list'`).

##### Returns

`GPUPrimitiveTopology`

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:118](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/Entity.ts#L118)

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

Defined in: [scene/contracts/Entity.ts:127](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/Entity.ts#L127)

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

> `abstract` **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/material/Material.ts:18](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/material/Material.ts#L18)

Lista de bindings GPU (uniform/storage buffers, texturas, samplers)
que este resource expõe ao `ResourceSystem`. Cada descriptor define
`id`, `role`, `schema` (StructSchema) e opcionalmente `storage`
(`'pool'` para coalescer N members do mesmo schema em 1 buffer).

#### Returns

readonly `GPUDescriptor`[]

#### Implementation of

`Resource.getDescriptors`

***

### getPipelineDescriptors()

> `abstract` **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/material/Material.ts:19](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/material/Material.ts#L19)

Pipelines GPU declaradas pelo resource (shader source + entry points
+ consumes). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly `PipelineDescriptor`[]

#### Implementation of

`Resource.getPipelineDescriptors`
