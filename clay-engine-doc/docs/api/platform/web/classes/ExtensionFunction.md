[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / ExtensionFunction

# Abstract Class: ExtensionFunction

Defined in: [src/scene/contracts/ExtensionFunction.ts:113](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L113)

Função de um ponto de extensão (spec 009): Resource com o código WGSL do usuário para o ponto `point`, os
parâmetros declarados por nome e tipo e os seus valores. O código é validado na criação e em `setCode`
(`point.check`: assinatura, símbolos, montagem em cada kernel do ponto) — erro síncrono nomeando o ponto.

Os parâmetros vivem no registro tipado da forma (spec 031, R8: `point.record(params)` — struct `<alias>_<hash>` com
um campo por parâmetro, sem `bitcast` nem teto de escalares), no pool da forma (`<ponto>:<hash>`), um registro por
função: o descritor `params` é desse schema, e o `data` é o registro, campo a campo. Mudar `values` envia o registro
e vale no quadro seguinte sem recompilar. `setCode` troca o código: a revisão (campo do registro, separada da forma)
sobe, o estágio dono compila o módulo novo e só troca quando ele compila (erro de compilação: evento
`extensionRejected`, e o módulo anterior continua). `setGraph` com parâmetros de outra forma muda o registro: a C2
passa a função para o pool da forma nova (`Entity.redescribe`).

O módulo gerado contém o alias do ponto para o struct da forma (ex. `alias TransformFnParams =
TransformFnParams_<hash>`), o carregador `<função>_params(slot: u32) -> <struct>` — que lê o registro no pool da forma
(lido pela arena de pools, `<ponto>_records_<hash>[slot]`) — e o código. Pontos com várias funções no mesmo shader (`field`)
recebem nomes com sufixo do hash (`renamed`).

## Extends

- [`Entity`](../../../elements/classes/Entity.md)\<[`ExtensionParamsData`](../interfaces/ExtensionParamsData.md)\>

## Extended by

- [`TransformFunction`](../../../elements/classes/TransformFunction.md)
- [`CameraFunction`](../../../elements/classes/CameraFunction.md)
- [`FieldFunction`](../../../elements/classes/FieldFunction.md)
- [`EmitFunction`](../../../elements/classes/EmitFunction.md)
- [`SurfaceFunction`](../../../elements/classes/SurfaceFunction.md)
- [`SpaceFunction`](../../../elements/classes/SpaceFunction.md)
- [`MaterialFunction`](../../../elements/classes/MaterialFunction.md)
- [`DensityFunction`](../../../elements/classes/DensityFunction.md)

## Implements

- [`Resource`](../interfaces/Resource.md)
- [`PointImplementation`](../interfaces/PointImplementation.md)

## Constructors

### Constructor

> `protected` **new ExtensionFunction**(`point`, `options`): `ExtensionFunction`

Defined in: [src/scene/contracts/ExtensionFunction.ts:138](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L138)

#### Parameters

##### point

[`WgslPoint`](../interfaces/WgslPoint.md)

##### options

[`ExtensionFunctionOptions`](../type-aliases/ExtensionFunctionOptions.md)

#### Returns

`ExtensionFunction`

#### Overrides

[`Entity`](../../../elements/classes/Entity.md).[`constructor`](../../../elements/classes/Entity.md#constructor)

## Properties

### point

> `readonly` **point**: [`WgslPoint`](../interfaces/WgslPoint.md)

Defined in: [src/scene/contracts/ExtensionFunction.ts:119](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L119)

Ponto de extensão.

#### Implementation of

[`PointImplementation`](../interfaces/PointImplementation.md).[`point`](../interfaces/PointImplementation.md#point)

***

### renamed

> `readonly` **renamed**: `boolean`

Defined in: [src/scene/contracts/ExtensionFunction.ts:121](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L121)

Renomeia a função, o alias e o carregador com o hash (ponto de cena: várias funções no mesmo shader).

***

### state

> **state**: [`ResourceState`](../enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [src/scene/contracts/ExtensionFunction.ts:117](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L117)

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

### code

#### Get Signature

> **get** **code**(): `string`

Defined in: [src/scene/contracts/ExtensionFunction.ts:188](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L188)

Código WGSL atual (num grafo, o gerado).

##### Returns

`string`

***

### composite

#### Get Signature

> **get** **composite**(): `CompositeFunction` \| `undefined`

Defined in: [src/scene/contracts/ExtensionFunction.ts:235](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L235)

A função com os nomes do sufixo do hash (spec 033), para reunir várias funções do ponto num mesmo shader;
`undefined` com a implementação pronta (grafo sem saída).

##### Returns

`CompositeFunction` \| `undefined`

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

### functionName

#### Get Signature

> **get** **functionName**(): `string`

Defined in: [src/scene/contracts/ExtensionFunction.ts:213](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L213)

Nome da função obrigatória no módulo (com sufixo quando `renamed`).

##### Returns

`string`

Nome da função obrigatória no módulo (com o sufixo do hash nos pontos de cena).

#### Implementation of

[`PointImplementation`](../interfaces/PointImplementation.md).[`functionName`](../interfaces/PointImplementation.md#functionname)

***

### graph

#### Get Signature

> **get** **graph**(): [`NodeGraph`](NodeGraph.md) \| `undefined`

Defined in: [src/scene/contracts/ExtensionFunction.ts:183](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L183)

Grafo de nós que gera o código, ou `undefined` (código escrito à mão).

##### Returns

[`NodeGraph`](NodeGraph.md) \| `undefined`

***

### implemented

#### Get Signature

> **get** **implemented**(): `boolean`

Defined in: [src/scene/contracts/ExtensionFunction.ts:178](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L178)

Tem função própria; `false` com um grafo sem saída (usa a implementação pronta do ponto).

##### Returns

`boolean`

A implementação tem função própria. `false` (grafo sem saída, spec 031): o módulo é o pronto do ponto e, nos
pontos de cena, a função não entra na composição.

#### Implementation of

[`PointImplementation`](../interfaces/PointImplementation.md).[`implemented`](../interfaces/PointImplementation.md#implemented)

***

### loaderName

#### Get Signature

> **get** **loaderName**(): `string`

Defined in: [src/scene/contracts/ExtensionFunction.ts:226](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L226)

Nome do carregador de parâmetros no módulo.

##### Returns

`string`

Nome do carregador de parâmetros no módulo.

#### Implementation of

[`PointImplementation`](../interfaces/PointImplementation.md).[`loaderName`](../interfaces/PointImplementation.md#loadername)

***

### module

#### Get Signature

> **get** **module**(): [`WgslModule`](../interfaces/WgslModule.md)

Defined in: [src/scene/contracts/ExtensionFunction.ts:193](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L193)

Módulo gerado do código atual (struct, carregador e código).

##### Returns

[`WgslModule`](../interfaces/WgslModule.md)

Módulo gerado do código atual.

#### Implementation of

[`PointImplementation`](../interfaces/PointImplementation.md).[`module`](../interfaces/PointImplementation.md#module)

***

### params

#### Get Signature

> **get** **params**(): `Readonly`\<`Record`\<`string`, [`ExtensionParamType`](../type-aliases/ExtensionParamType.md)\>\>

Defined in: [src/scene/contracts/ExtensionFunction.ts:163](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L163)

Parâmetros declarados (nome → tipo); num grafo, `nó_parâmetro`.

##### Returns

`Readonly`\<`Record`\<`string`, [`ExtensionParamType`](../type-aliases/ExtensionParamType.md)\>\>

***

### paramsStruct

#### Get Signature

> **get** **paramsStruct**(): `string`

Defined in: [src/scene/contracts/ExtensionFunction.ts:203](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L203)

Nome do struct de parâmetros gerado (o do registro tipado da forma).

##### Returns

`string`

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

### record

#### Get Signature

> **get** **record**(): [`StructSchema`](StructSchema.md)

Defined in: [src/scene/contracts/ExtensionFunction.ts:208](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L208)

Schema do registro tipado da forma (spec 031, R8); o nome (`<ponto>:<hash>`) é a chave do pool.

##### Returns

[`StructSchema`](StructSchema.md)

***

### requires

#### Get Signature

> **get** **requires**(): readonly [`WgslModule`](../interfaces/WgslModule.md)[]

Defined in: [src/scene/contracts/ExtensionFunction.ts:173](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L173)

Módulos que o código usa (num grafo, os módulos dos nós).

##### Returns

readonly [`WgslModule`](../interfaces/WgslModule.md)[]

***

### revision

#### Get Signature

> **get** **revision**(): `number`

Defined in: [src/scene/contracts/ExtensionFunction.ts:198](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L198)

Revisão do código (sobe a cada `setCode`).

##### Returns

`number`

Revisão do código.

#### Implementation of

[`PointImplementation`](../interfaces/PointImplementation.md).[`revision`](../interfaces/PointImplementation.md#revision)

***

### values

#### Get Signature

> **get** **values**(): `Record`\<`string`, [`ExtensionParamValue`](../type-aliases/ExtensionParamValue.md)\>

Defined in: [src/scene/contracts/ExtensionFunction.ts:168](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L168)

Valores dos parâmetros por nome (leitura e escrita; escrever envia no quadro seguinte).

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

### codeLine()

> **codeLine**(`moduleLine`): `number`

Defined in: [src/scene/contracts/ExtensionFunction.ts:245](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L245)

Linha no código do usuário de uma linha do módulo gerado (≤ 0: no trecho gerado).

#### Parameters

##### moduleLine

`number`

#### Returns

`number`

#### Implementation of

[`PointImplementation`](../interfaces/PointImplementation.md).[`codeLine`](../interfaces/PointImplementation.md#codeline)

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

Defined in: [src/scene/contracts/ExtensionFunction.ts:310](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L310)

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

Defined in: [src/scene/contracts/ExtensionFunction.ts:314](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L314)

Pipelines GPU declaradas pelo resource (shader e entry points; recursos
pelos módulos declarados). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly [`PipelineDescriptor`](../interfaces/PipelineDescriptor.md)[]

#### Implementation of

[`Resource`](../interfaces/Resource.md).[`getPipelineDescriptors`](../interfaces/Resource.md#getpipelinedescriptors)

***

### optionalName()

> **optionalName**(`name`): `string` \| `undefined`

Defined in: [src/scene/contracts/ExtensionFunction.ts:220](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L220)

Nome no módulo da função opcional `name`, se o código a define (com o sufixo do hash quando `renamed`).

#### Parameters

##### name

`string`

#### Returns

`string` \| `undefined`

#### Implementation of

[`PointImplementation`](../interfaces/PointImplementation.md).[`optionalName`](../interfaces/PointImplementation.md#optionalname)

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

[`ExtensionParamsData`](../interfaces/ExtensionParamsData.md)

#### Returns

`void`

#### Inherited from

[`Entity`](../../../elements/classes/Entity.md).[`redescribe`](../../../elements/classes/Entity.md#redescribe)

***

### setCode()

> **setCode**(`code`): `void`

Defined in: [src/scene/contracts/ExtensionFunction.ts:253](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L253)

Troca o código. Valida na hora (lança como na criação, e o código anterior continua); a revisão sobe e o
estágio dono compila o módulo novo.

#### Parameters

##### code

`string`

#### Returns

`void`

***

### setGraph()

> **setGraph**(`graph`): `void`

Defined in: [src/scene/contracts/ExtensionFunction.ts:270](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L270)

Troca o grafo (topologia nova: spec 031, US2). Valida e gera na hora (lança como na criação, e o grafo anterior
continua); parâmetros de mesmo nome e tipo mantêm o valor, os novos recebem o do grafo; a revisão sobe e o estágio
dono compila em transição. Com parâmetros de outra forma, o registro muda de schema e de pool (a C2 realoca a
função; R8). Mudar só valores não passa por aqui (`values`, sem recompilar).

#### Parameters

##### graph

[`NodeGraph`](NodeGraph.md)

#### Returns

`void`
