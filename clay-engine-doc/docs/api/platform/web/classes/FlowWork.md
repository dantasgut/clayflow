[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / FlowWork

# Abstract Class: FlowWork

Defined in: [src/scene/flows/FlowWork.ts:84](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowWork.ts#L84)

Resource de trabalho de um Flow (spec 039, `slot.work`): um Resource comum cujos descritores são os das partes que o
Flow e os seus auxiliares registram (`use`). A C2 o insere no World quando aloca o Flow e o remove no descarte;
`refresh()` redescreve quando alguma parte mudou de forma (cresce e encolhe), e a C2 realoca só o que mudou e religa
quem o usa. Cada Flow declara a sua subclasse com um `static schema` (o nome do tipo no World).

## Extends

- [`Entity`](../../../elements/classes/Entity.md)

## Implements

- [`Resource`](../interfaces/Resource.md)

## Constructors

### Constructor

> **new FlowWork**(): `FlowWork`

Defined in: [src/scene/flows/FlowWork.ts:90](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowWork.ts#L90)

#### Returns

`FlowWork`

#### Overrides

[`Entity`](../../../elements/classes/Entity.md).[`constructor`](../../../elements/classes/Entity.md#constructor)

## Properties

### state

> **state**: [`ResourceState`](../enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [src/scene/flows/FlowWork.ts:85](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowWork.ts#L85)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

[`Resource`](../interfaces/Resource.md).[`state`](../interfaces/Resource.md#state)

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

### pipelines

#### Get Signature

> **get** **pipelines**(): [`WorkPipelines`](../interfaces/WorkPipelines.md)

Defined in: [src/scene/flows/FlowWork.ts:99](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowWork.ts#L99)

Os pipelines do Flow dono (T060g): a C2 os entrega quando registra o Flow, antes de qualquer transição dele.

##### Throws

Error antes disso (uma parte só prepara kernels nas transições do Flow dono).

##### Returns

[`WorkPipelines`](../interfaces/WorkPipelines.md)

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

### attachPipelines()

> **attachPipelines**(`pipelines`): `void`

Defined in: [src/scene/flows/FlowWork.ts:108](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowWork.ts#L108)

A C2 entrega os pipelines do Flow dono (uma vez, no registro dele).

#### Parameters

##### pipelines

[`WorkPipelines`](../interfaces/WorkPipelines.md)

#### Returns

`void`

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

### drop()

> **drop**(`part`): `void`

Defined in: [src/scene/flows/FlowWork.ts:120](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowWork.ts#L120)

Tira uma parte (ex.: uma busca recriada com outra grade): os descritores dela saem e a C2 os libera.

#### Parameters

##### part

[`WorkPart`](../interfaces/WorkPart.md)

#### Returns

`void`

***

### getDescriptors()

> **getDescriptors**(): readonly [`GPUDescriptor`](../interfaces/GPUDescriptor.md)[]

Defined in: [src/scene/flows/FlowWork.ts:127](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowWork.ts#L127)

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

Defined in: [src/scene/flows/FlowWork.ts:131](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowWork.ts#L131)

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

`TData`

#### Returns

`void`

#### Inherited from

[`Entity`](../../../elements/classes/Entity.md).[`redescribe`](../../../elements/classes/Entity.md#redescribe)

***

### refresh()

> **refresh**(): `boolean`

Defined in: [src/scene/flows/FlowWork.ts:139](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowWork.ts#L139)

Redescreve se algum descritor das partes mudou de forma desde a última vez; devolve `true` quando mudou (a C2
realocou o que mudou e os bind groups que o usam são refeitos).

#### Returns

`boolean`

***

### use()

> **use**\<`P`\>(`part`): `P`

Defined in: [src/scene/flows/FlowWork.ts:113](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowWork.ts#L113)

Registra uma parte; os descritores dela entram no próximo `refresh()` (ou na inserção).

#### Type Parameters

##### P

`P` *extends* [`WorkPart`](../interfaces/WorkPart.md)

#### Parameters

##### part

`P`

#### Returns

`P`
