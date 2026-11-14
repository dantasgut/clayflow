[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / SetGraph

# Class: SetGraph

Defined in: [src/scene/graph/SetGraph.ts:46](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetGraph.ts#L46)

Grafo de nós de conjunto como Resource (spec 031, US3): o grafo e os valores dos parâmetros de todos os nós
(`values['nó_parâmetro']`, sem teto; mudar um valor envia o registro do pool `SetGraphRecord` e o `GraphFlow` refaz o
grafo no quadro seguinte, sem recompilar). `setGraph` troca a topologia (revisão +1: o `GraphFlow` recria os
nós). Na entidade, ao lado do Resource alvo (ex.: a `GraphGeometry` que o nó de saída escreve), do material e do
`Transform`.

## Extends

- [`Entity`](../../../elements/classes/Entity.md)\<[`SetGraphData`](../interfaces/SetGraphData.md)\>

## Implements

- [`Resource`](../interfaces/Resource.md)

## Constructors

### Constructor

> **new SetGraph**(`options`): `SetGraph`

Defined in: [src/scene/graph/SetGraph.ts:57](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetGraph.ts#L57)

#### Parameters

##### options

[`SetGraphOptions`](../interfaces/SetGraphOptions.md)

#### Returns

`SetGraph`

#### Overrides

[`Entity`](../../../elements/classes/Entity.md).[`constructor`](../../../elements/classes/Entity.md#constructor)

## Properties

### state

> **state**: [`ResourceState`](../enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [src/scene/graph/SetGraph.ts:50](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetGraph.ts#L50)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

[`Resource`](../interfaces/Resource.md).[`state`](../interfaces/Resource.md#state)

***

### schema

> `readonly` `static` **schema**: [`StructSchema`](StructSchema.md) = `SetGraphRecordSchema`

Defined in: [src/scene/graph/SetGraph.ts:48](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetGraph.ts#L48)

Registro dos valores (um pool para todos os grafos de conjunto).

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](../../../elements/classes/Entity.md)\<`object`\>[]

Defined in: [src/scene/contracts/Entity.ts:160](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L160)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](../../../elements/classes/Entity.md)\<`object`\>[]

#### Inherited from

[`Entity`](../../../elements/classes/Entity.md).[`attached`](../../../elements/classes/Entity.md#attached)

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

[`Resource`](../interfaces/Resource.md).[`data`](../interfaces/Resource.md#data)

#### Inherited from

[`Entity`](../../../elements/classes/Entity.md).[`data`](../../../elements/classes/Entity.md#data)

***

### graph

#### Get Signature

> **get** **graph**(): [`NodeGraph`](NodeGraph.md)

Defined in: [src/scene/graph/SetGraph.ts:69](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetGraph.ts#L69)

O grafo atual.

##### Returns

[`NodeGraph`](NodeGraph.md)

***

### params

#### Get Signature

> **get** **params**(): `Readonly`\<`Record`\<`string`, [`ExtensionParamType`](../type-aliases/ExtensionParamType.md)\>\>

Defined in: [src/scene/graph/SetGraph.ts:74](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetGraph.ts#L74)

Parâmetros de todos os nós (`nó_parâmetro` → tipo).

##### Returns

`Readonly`\<`Record`\<`string`, [`ExtensionParamType`](../type-aliases/ExtensionParamType.md)\>\>

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

[`Entity`](../../../elements/classes/Entity.md).[`rawData`](../../../elements/classes/Entity.md#rawdata)

***

### revision

#### Get Signature

> **get** **revision**(): `number`

Defined in: [src/scene/graph/SetGraph.ts:84](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetGraph.ts#L84)

Revisão da topologia (sobe a cada `setGraph`).

##### Returns

`number`

***

### values

#### Get Signature

> **get** **values**(): `Record`\<`string`, [`ExtensionParamValue`](../type-aliases/ExtensionParamValue.md)\>

Defined in: [src/scene/graph/SetGraph.ts:79](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetGraph.ts#L79)

Valores por `nó_parâmetro` (leitura e escrita; escrever refaz o grafo no quadro seguinte).

##### Returns

`Record`\<`string`, [`ExtensionParamValue`](../type-aliases/ExtensionParamValue.md)\>

## Methods

### add()

> **add**(`e`): `this`

Defined in: [src/scene/contracts/Entity.ts:140](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L140)

Anexa uma Entity-filha. Retorna `this` para chaining fluente.
Não valida ciclos nem múltiplos pais — responsabilidade do caller.

#### Parameters

##### e

[`Entity`](../../../elements/classes/Entity.md)\<`object`\>

#### Returns

`this`

#### Inherited from

[`Entity`](../../../elements/classes/Entity.md).[`add`](../../../elements/classes/Entity.md#add)

***

### detach()

> **detach**(`e`): `boolean`

Defined in: [src/scene/contracts/Entity.ts:149](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L149)

Desanexa uma Entity-filha direta (inverso de `add`). Devolve `false` se ela não é filha desta. Numa entidade já
inserida, use `World.detach` (que também atualiza a cena).

#### Parameters

##### e

[`Entity`](../../../elements/classes/Entity.md)\<`object`\>

#### Returns

`boolean`

#### Inherited from

[`Entity`](../../../elements/classes/Entity.md).[`detach`](../../../elements/classes/Entity.md#detach)

***

### getDescriptors()

> **getDescriptors**(): readonly [`GPUDescriptor`](../interfaces/GPUDescriptor.md)[]

Defined in: [src/scene/graph/SetGraph.ts:115](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetGraph.ts#L115)

Lista de bindings GPU (uniform/storage buffers, texturas, samplers)
que este resource expõe ao `ResourceSystem`. Cada descriptor define
`id`, `role`, `schema` (StructSchema) e opcionalmente `storage`
(`'pool'` para coalescer N members do mesmo schema em 1 buffer).

#### Returns

readonly [`GPUDescriptor`](../interfaces/GPUDescriptor.md)[]

#### Implementation of

[`Resource`](../interfaces/Resource.md).[`getDescriptors`](../interfaces/Resource.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly [`PipelineDescriptor`](../interfaces/PipelineDescriptor.md)[]

Defined in: [src/scene/graph/SetGraph.ts:121](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetGraph.ts#L121)

Pipelines GPU declaradas pelo resource (shader e entry points; recursos
pelos módulos declarados). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly [`PipelineDescriptor`](../interfaces/PipelineDescriptor.md)[]

#### Implementation of

[`Resource`](../interfaces/Resource.md).[`getPipelineDescriptors`](../interfaces/Resource.md#getpipelinedescriptors)

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

readonly [`GPUDescriptor`](../interfaces/GPUDescriptor.md)[]

##### next

[`SetGraphData`](../interfaces/SetGraphData.md)

#### Returns

`void`

#### Inherited from

[`Entity`](../../../elements/classes/Entity.md).[`redescribe`](../../../elements/classes/Entity.md#redescribe)

***

### setGraph()

> **setGraph**(`graph`): `void`

Defined in: [src/scene/graph/SetGraph.ts:101](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetGraph.ts#L101)

Troca o grafo (topologia nova): valida na hora (lança e o anterior continua); valores de mesmo nome e tipo são
mantidos, os novos recebem os do grafo; a revisão sobe.

#### Parameters

##### graph

[`NodeGraph`](NodeGraph.md)

#### Returns

`void`

***

### valuesOf()

> **valuesOf**(`id`): `Readonly`\<`Record`\<`string`, [`ExtensionParamValue`](../type-aliases/ExtensionParamValue.md)\>\>

Defined in: [src/scene/graph/SetGraph.ts:89](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetGraph.ts#L89)

Valores atuais do nó `id` (pelo nome do parâmetro).

#### Parameters

##### id

`string`

#### Returns

`Readonly`\<`Record`\<`string`, [`ExtensionParamValue`](../type-aliases/ExtensionParamValue.md)\>\>
