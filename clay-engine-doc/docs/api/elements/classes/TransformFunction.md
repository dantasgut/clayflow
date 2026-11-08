[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / TransformFunction

# Class: TransformFunction

Defined in: [src/elements/extension/TransformFunction.ts:20](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/extension/TransformFunction.ts#L20)

Função do ponto `transform` (spec 009) — a matriz local de uma entidade escrita pelo usuário em WGSL:

```wgsl
fn transform_fn(slot: u32, t: Transform, data: TransformFnParams, time: f32) -> mat4x4f
```

`slot` é o índice do `Transform` no pool, `t` a intenção (posição, rotação, escala; `transform_local(t).world` dá o
TRS), `data` os parâmetros declarados em `params` (struct `TransformFnParams`) e `time` o tempo simulado (s). Anexada
a uma entidade com `Transform`, substitui o TRS dela; o `Parent` compõe sobre o resultado. Uma instância por
entidade (cada uma com os seus valores); instâncias com o mesmo código compartilham o pipeline e formam um grupo (um
despacho por código, não por entidade). Matriz com valor não finito mantém o TRS.

## Extends

- [`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md)

## Constructors

### Constructor

> **new TransformFunction**(`options`): `TransformFunction`

Defined in: [src/elements/extension/TransformFunction.ts:21](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/extension/TransformFunction.ts#L21)

#### Parameters

##### options

[`ExtensionFunctionOptions`](../../platform/web/type-aliases/ExtensionFunctionOptions.md)

#### Returns

`TransformFunction`

#### Overrides

[`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md).[`constructor`](../../platform/web/classes/ExtensionFunction.md#constructor)

## Properties

### point

> `readonly` **point**: [`WgslPoint`](../../platform/web/interfaces/WgslPoint.md)

Defined in: [src/scene/contracts/ExtensionFunction.ts:119](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L119)

Ponto de extensão.

#### Inherited from

[`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md).[`point`](../../platform/web/classes/ExtensionFunction.md#point)

***

### renamed

> `readonly` **renamed**: `boolean`

Defined in: [src/scene/contracts/ExtensionFunction.ts:121](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L121)

Renomeia a função, o alias e o carregador com o hash (ponto de cena: várias funções no mesmo shader).

#### Inherited from

[`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md).[`renamed`](../../platform/web/classes/ExtensionFunction.md#renamed)

***

### state

> **state**: [`ResourceState`](../../platform/web/enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [src/scene/contracts/ExtensionFunction.ts:117](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L117)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md).[`state`](../../platform/web/classes/ExtensionFunction.md#state)

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

[`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md).[`attached`](../../platform/web/classes/ExtensionFunction.md#attached)

***

### code

#### Get Signature

> **get** **code**(): `string`

Defined in: [src/scene/contracts/ExtensionFunction.ts:188](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L188)

Código WGSL atual (num grafo, o gerado).

##### Returns

`string`

#### Inherited from

[`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md).[`code`](../../platform/web/classes/ExtensionFunction.md#code)

***

### composite

#### Get Signature

> **get** **composite**(): `CompositeFunction` \| `undefined`

Defined in: [src/scene/contracts/ExtensionFunction.ts:235](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L235)

A função com os nomes do sufixo do hash (spec 033), para reunir várias funções do ponto num mesmo shader;
`undefined` com a implementação pronta (grafo sem saída).

##### Returns

`CompositeFunction` \| `undefined`

#### Inherited from

[`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md).[`composite`](../../platform/web/classes/ExtensionFunction.md#composite)

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

#### Inherited from

[`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md).[`data`](../../platform/web/classes/ExtensionFunction.md#data)

***

### functionName

#### Get Signature

> **get** **functionName**(): `string`

Defined in: [src/scene/contracts/ExtensionFunction.ts:213](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L213)

Nome da função obrigatória no módulo (com sufixo quando `renamed`).

##### Returns

`string`

Nome da função obrigatória no módulo (com o sufixo do hash nos pontos de cena).

#### Inherited from

[`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md).[`functionName`](../../platform/web/classes/ExtensionFunction.md#functionname)

***

### graph

#### Get Signature

> **get** **graph**(): [`NodeGraph`](../../platform/web/classes/NodeGraph.md) \| `undefined`

Defined in: [src/scene/contracts/ExtensionFunction.ts:183](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L183)

Grafo de nós que gera o código, ou `undefined` (código escrito à mão).

##### Returns

[`NodeGraph`](../../platform/web/classes/NodeGraph.md) \| `undefined`

#### Inherited from

[`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md).[`graph`](../../platform/web/classes/ExtensionFunction.md#graph)

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

#### Inherited from

[`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md).[`implemented`](../../platform/web/classes/ExtensionFunction.md#implemented)

***

### loaderName

#### Get Signature

> **get** **loaderName**(): `string`

Defined in: [src/scene/contracts/ExtensionFunction.ts:226](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L226)

Nome do carregador de parâmetros no módulo.

##### Returns

`string`

Nome do carregador de parâmetros no módulo.

#### Inherited from

[`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md).[`loaderName`](../../platform/web/classes/ExtensionFunction.md#loadername)

***

### module

#### Get Signature

> **get** **module**(): [`WgslModule`](../../platform/web/interfaces/WgslModule.md)

Defined in: [src/scene/contracts/ExtensionFunction.ts:193](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L193)

Módulo gerado do código atual (struct, carregador e código).

##### Returns

[`WgslModule`](../../platform/web/interfaces/WgslModule.md)

Módulo gerado do código atual.

#### Inherited from

[`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md).[`module`](../../platform/web/classes/ExtensionFunction.md#module)

***

### params

#### Get Signature

> **get** **params**(): `Readonly`\<`Record`\<`string`, [`ExtensionParamType`](../../platform/web/type-aliases/ExtensionParamType.md)\>\>

Defined in: [src/scene/contracts/ExtensionFunction.ts:163](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L163)

Parâmetros declarados (nome → tipo); num grafo, `nó_parâmetro`.

##### Returns

`Readonly`\<`Record`\<`string`, [`ExtensionParamType`](../../platform/web/type-aliases/ExtensionParamType.md)\>\>

#### Inherited from

[`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md).[`params`](../../platform/web/classes/ExtensionFunction.md#params)

***

### paramsStruct

#### Get Signature

> **get** **paramsStruct**(): `string`

Defined in: [src/scene/contracts/ExtensionFunction.ts:203](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L203)

Nome do struct de parâmetros gerado (o do registro tipado da forma).

##### Returns

`string`

#### Inherited from

[`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md).[`paramsStruct`](../../platform/web/classes/ExtensionFunction.md#paramsstruct)

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

[`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md).[`rawData`](../../platform/web/classes/ExtensionFunction.md#rawdata)

***

### record

#### Get Signature

> **get** **record**(): [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/scene/contracts/ExtensionFunction.ts:208](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L208)

Schema do registro tipado da forma (spec 031, R8); o nome (`<ponto>:<hash>`) é a chave do pool.

##### Returns

[`StructSchema`](../../platform/web/classes/StructSchema.md)

#### Inherited from

[`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md).[`record`](../../platform/web/classes/ExtensionFunction.md#record)

***

### requires

#### Get Signature

> **get** **requires**(): readonly [`WgslModule`](../../platform/web/interfaces/WgslModule.md)[]

Defined in: [src/scene/contracts/ExtensionFunction.ts:173](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L173)

Módulos que o código usa (num grafo, os módulos dos nós).

##### Returns

readonly [`WgslModule`](../../platform/web/interfaces/WgslModule.md)[]

#### Inherited from

[`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md).[`requires`](../../platform/web/classes/ExtensionFunction.md#requires)

***

### revision

#### Get Signature

> **get** **revision**(): `number`

Defined in: [src/scene/contracts/ExtensionFunction.ts:198](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L198)

Revisão do código (sobe a cada `setCode`).

##### Returns

`number`

Revisão do código.

#### Inherited from

[`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md).[`revision`](../../platform/web/classes/ExtensionFunction.md#revision)

***

### values

#### Get Signature

> **get** **values**(): `Record`\<`string`, [`ExtensionParamValue`](../../platform/web/type-aliases/ExtensionParamValue.md)\>

Defined in: [src/scene/contracts/ExtensionFunction.ts:168](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L168)

Valores dos parâmetros por nome (leitura e escrita; escrever envia no quadro seguinte).

##### Returns

`Record`\<`string`, [`ExtensionParamValue`](../../platform/web/type-aliases/ExtensionParamValue.md)\>

#### Inherited from

[`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md).[`values`](../../platform/web/classes/ExtensionFunction.md#values)

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

[`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md).[`add`](../../platform/web/classes/ExtensionFunction.md#add)

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

#### Inherited from

[`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md).[`codeLine`](../../platform/web/classes/ExtensionFunction.md#codeline)

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

[`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md).[`detach`](../../platform/web/classes/ExtensionFunction.md#detach)

***

### getDescriptors()

> **getDescriptors**(): readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

Defined in: [src/scene/contracts/ExtensionFunction.ts:310](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L310)

Lista de bindings GPU (uniform/storage buffers, texturas, samplers)
que este resource expõe ao `ResourceSystem`. Cada descriptor define
`id`, `role`, `schema` (StructSchema) e opcionalmente `storage`
(`'pool'` para coalescer N members do mesmo schema em 1 buffer).

#### Returns

readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

#### Inherited from

[`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md).[`getDescriptors`](../../platform/web/classes/ExtensionFunction.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

Defined in: [src/scene/contracts/ExtensionFunction.ts:314](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L314)

Pipelines GPU declaradas pelo resource (shader e entry points; recursos
pelos módulos declarados). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

#### Inherited from

[`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md).[`getPipelineDescriptors`](../../platform/web/classes/ExtensionFunction.md#getpipelinedescriptors)

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

#### Inherited from

[`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md).[`optionalName`](../../platform/web/classes/ExtensionFunction.md#optionalname)

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

[`ExtensionParamsData`](../../platform/web/interfaces/ExtensionParamsData.md)

#### Returns

`void`

#### Inherited from

[`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md).[`redescribe`](../../platform/web/classes/ExtensionFunction.md#redescribe)

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

#### Inherited from

[`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md).[`setCode`](../../platform/web/classes/ExtensionFunction.md#setcode)

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

[`NodeGraph`](../../platform/web/classes/NodeGraph.md)

#### Returns

`void`

#### Inherited from

[`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md).[`setGraph`](../../platform/web/classes/ExtensionFunction.md#setgraph)
