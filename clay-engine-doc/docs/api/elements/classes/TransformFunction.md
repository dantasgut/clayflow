[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / TransformFunction

# Class: TransformFunction

Defined in: [elements/extension/TransformFunction.ts:20](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/extension/TransformFunction.ts#L20)

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

- `ExtensionFunction`

## Constructors

### Constructor

> **new TransformFunction**(`options`): `TransformFunction`

Defined in: [elements/extension/TransformFunction.ts:24](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/extension/TransformFunction.ts#L24)

#### Parameters

##### options

`ExtensionFunctionOptions`

#### Returns

`TransformFunction`

#### Overrides

`ExtensionFunction.constructor`

## Properties

### params

> `readonly` **params**: `Readonly`\<`Record`\<`string`, `ExtensionParamType`\>\>

Defined in: [scene/contracts/ExtensionFunction.ts:135](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/ExtensionFunction.ts#L135)

Parâmetros declarados (nome → tipo).

#### Inherited from

`ExtensionFunction.params`

***

### point

> `readonly` **point**: `WgslPoint`

Defined in: [scene/contracts/ExtensionFunction.ts:133](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/ExtensionFunction.ts#L133)

Ponto de extensão.

#### Inherited from

`ExtensionFunction.point`

***

### renamed

> `readonly` **renamed**: `boolean`

Defined in: [scene/contracts/ExtensionFunction.ts:141](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/ExtensionFunction.ts#L141)

Renomeia a função, o alias e o carregador com o hash (ponto de cena: várias funções no mesmo shader).

#### Inherited from

`ExtensionFunction.renamed`

***

### requires

> `readonly` **requires**: readonly `WgslModule`[]

Defined in: [scene/contracts/ExtensionFunction.ts:139](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/ExtensionFunction.ts#L139)

Módulos do núcleo que o código usa.

#### Inherited from

[`FieldFunction`](FieldFunction.md).[`requires`](FieldFunction.md#requires)

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [scene/contracts/ExtensionFunction.ts:131](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/ExtensionFunction.ts#L131)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

`ExtensionFunction.state`

***

### values

> `readonly` **values**: `Record`\<`string`, `ExtensionParamValue`\>

Defined in: [scene/contracts/ExtensionFunction.ts:137](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/ExtensionFunction.ts#L137)

Valores dos parâmetros por nome (leitura e escrita; escrever envia no quadro seguinte).

#### Inherited from

`ExtensionFunction.values`

***

### schema

> `readonly` `static` **schema**: `StructSchema` = `transformPoint.record`

Defined in: [elements/extension/TransformFunction.ts:22](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/extension/TransformFunction.ts#L22)

Registro de parâmetros das funções `transform` (um pool por ponto).

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

`ExtensionFunction.attached`

***

### code

#### Get Signature

> **get** **code**(): `string`

Defined in: [scene/contracts/ExtensionFunction.ts:196](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/ExtensionFunction.ts#L196)

Código WGSL atual.

##### Returns

`string`

#### Inherited from

`ExtensionFunction.code`

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

#### Inherited from

`ExtensionFunction.data`

***

### functionName

#### Get Signature

> **get** **functionName**(): `string`

Defined in: [scene/contracts/ExtensionFunction.ts:216](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/ExtensionFunction.ts#L216)

Nome da função obrigatória no módulo (com sufixo quando `renamed`).

##### Returns

`string`

#### Inherited from

`ExtensionFunction.functionName`

***

### loaderName

#### Get Signature

> **get** **loaderName**(): `string`

Defined in: [scene/contracts/ExtensionFunction.ts:229](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/ExtensionFunction.ts#L229)

Nome do carregador de parâmetros no módulo.

##### Returns

`string`

#### Inherited from

`ExtensionFunction.loaderName`

***

### module

#### Get Signature

> **get** **module**(): `WgslModule`

Defined in: [scene/contracts/ExtensionFunction.ts:201](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/ExtensionFunction.ts#L201)

Módulo gerado do código atual (struct, carregador e código).

##### Returns

`WgslModule`

#### Inherited from

`ExtensionFunction.module`

***

### paramsStruct

#### Get Signature

> **get** **paramsStruct**(): `string`

Defined in: [scene/contracts/ExtensionFunction.ts:211](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/ExtensionFunction.ts#L211)

Nome do struct de parâmetros gerado.

##### Returns

`string`

#### Inherited from

`ExtensionFunction.paramsStruct`

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

`ExtensionFunction.rawData`

***

### revision

#### Get Signature

> **get** **revision**(): `number`

Defined in: [scene/contracts/ExtensionFunction.ts:206](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/ExtensionFunction.ts#L206)

Revisão do código (sobe a cada `setCode`).

##### Returns

`number`

#### Inherited from

`ExtensionFunction.revision`

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

`ExtensionFunction.add`

***

### codeLine()

> **codeLine**(`moduleLine`): `number`

Defined in: [scene/contracts/ExtensionFunction.ts:235](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/ExtensionFunction.ts#L235)

Linha no código do usuário de uma linha do módulo gerado (≤ 0: no trecho gerado).

#### Parameters

##### moduleLine

`number`

#### Returns

`number`

#### Inherited from

`ExtensionFunction.codeLine`

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

`ExtensionFunction.detach`

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [scene/contracts/ExtensionFunction.ts:250](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/ExtensionFunction.ts#L250)

Lista de bindings GPU (uniform/storage buffers, texturas, samplers)
que este resource expõe ao `ResourceSystem`. Cada descriptor define
`id`, `role`, `schema` (StructSchema) e opcionalmente `storage`
(`'pool'` para coalescer N members do mesmo schema em 1 buffer).

#### Returns

readonly `GPUDescriptor`[]

#### Inherited from

`ExtensionFunction.getDescriptors`

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [scene/contracts/ExtensionFunction.ts:254](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/ExtensionFunction.ts#L254)

Pipelines GPU declaradas pelo resource (shader source + entry points
+ consumes). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly `PipelineDescriptor`[]

#### Inherited from

`ExtensionFunction.getPipelineDescriptors`

***

### optionalName()

> **optionalName**(`name`): `string` \| `undefined`

Defined in: [scene/contracts/ExtensionFunction.ts:223](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/ExtensionFunction.ts#L223)

Nome no módulo da função opcional `name`, se o código a define (com o sufixo do hash quando `renamed`).

#### Parameters

##### name

`string`

#### Returns

`string` \| `undefined`

#### Inherited from

`ExtensionFunction.optionalName`

***

### setCode()

> **setCode**(`code`): `void`

Defined in: [scene/contracts/ExtensionFunction.ts:243](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/ExtensionFunction.ts#L243)

Troca o código. Valida na hora (lança como na criação, e o código anterior continua); a revisão sobe e o
estágio dono compila o módulo novo.

#### Parameters

##### code

`string`

#### Returns

`void`

#### Inherited from

`ExtensionFunction.setCode`
