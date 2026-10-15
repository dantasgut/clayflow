[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / CameraFunction

# Class: CameraFunction

Defined in: [elements/extension/CameraFunction.ts:22](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/extension/CameraFunction.ts#L22)

Função do ponto `camera` (spec 009) — vista e projeção de uma câmera escritas pelo usuário em WGSL:

```wgsl
fn camera_fn(c: Camera, world: mat4x4f, aspect: f32, data: CameraFnParams, time: f32) -> CameraOut
// opcional: projeção de um ponto da vista para o clip (projeções não lineares, por vértice no desenho)
fn camera_project(view_pos: vec3f, data: CameraFnParams) -> vec4f
```

`c` são os parâmetros da `Camera`, `world` a matriz de mundo do `Transform` dela, `aspect` a razão em uso, `data`
os parâmetros declarados em `params` e `time` o tempo simulado (s). Anexada à entidade da câmera, substitui a
composição padrão (a `viewProjection` é `projection · view`). Com `camera_project`, o desenho da câmera ativa
projeta cada vértice por ela (a sombra continua com a câmera da luz); triângulos grandes não se curvam — malhas
finas. Uma instância por câmera.

## Extends

- `ExtensionFunction`

## Constructors

### Constructor

> **new CameraFunction**(`options`): `CameraFunction`

Defined in: [elements/extension/CameraFunction.ts:26](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/extension/CameraFunction.ts#L26)

#### Parameters

##### options

`ExtensionFunctionOptions`

#### Returns

`CameraFunction`

#### Overrides

`ExtensionFunction.constructor`

## Properties

### params

> `readonly` **params**: `Readonly`\<`Record`\<`string`, `ExtensionParamType`\>\>

Defined in: [scene/contracts/ExtensionFunction.ts:135](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/ExtensionFunction.ts#L135)

Parâmetros declarados (nome → tipo).

#### Inherited from

`ExtensionFunction.params`

***

### point

> `readonly` **point**: `WgslPoint`

Defined in: [scene/contracts/ExtensionFunction.ts:133](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/ExtensionFunction.ts#L133)

Ponto de extensão.

#### Inherited from

`ExtensionFunction.point`

***

### renamed

> `readonly` **renamed**: `boolean`

Defined in: [scene/contracts/ExtensionFunction.ts:141](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/ExtensionFunction.ts#L141)

Renomeia a função, o alias e o carregador com o hash (ponto de cena: várias funções no mesmo shader).

#### Inherited from

`ExtensionFunction.renamed`

***

### requires

> `readonly` **requires**: readonly `WgslModule`[]

Defined in: [scene/contracts/ExtensionFunction.ts:139](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/ExtensionFunction.ts#L139)

Módulos do núcleo que o código usa.

#### Inherited from

`ExtensionFunction.requires`

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [scene/contracts/ExtensionFunction.ts:131](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/ExtensionFunction.ts#L131)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

`ExtensionFunction.state`

***

### values

> `readonly` **values**: `Record`\<`string`, `ExtensionParamValue`\>

Defined in: [scene/contracts/ExtensionFunction.ts:137](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/ExtensionFunction.ts#L137)

Valores dos parâmetros por nome (leitura e escrita; escrever envia no quadro seguinte).

#### Inherited from

`ExtensionFunction.values`

***

### schema

> `readonly` `static` **schema**: `StructSchema` = `cameraPoint.record`

Defined in: [elements/extension/CameraFunction.ts:24](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/extension/CameraFunction.ts#L24)

Registro de parâmetros das funções `camera` (um pool por ponto).

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)\<`object`\>[]

Defined in: [scene/contracts/Entity.ts:138](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/Entity.ts#L138)

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

Defined in: [scene/contracts/ExtensionFunction.ts:196](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/ExtensionFunction.ts#L196)

Código WGSL atual.

##### Returns

`string`

#### Inherited from

`ExtensionFunction.code`

***

### data

#### Get Signature

> **get** **data**(): `TData`

Defined in: [scene/contracts/Entity.ts:90](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/Entity.ts#L90)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`TData`

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [scene/contracts/Entity.ts:96](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/Entity.ts#L96)

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

Defined in: [scene/contracts/ExtensionFunction.ts:216](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/ExtensionFunction.ts#L216)

Nome da função obrigatória no módulo (com sufixo quando `renamed`).

##### Returns

`string`

#### Inherited from

`ExtensionFunction.functionName`

***

### loaderName

#### Get Signature

> **get** **loaderName**(): `string`

Defined in: [scene/contracts/ExtensionFunction.ts:229](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/ExtensionFunction.ts#L229)

Nome do carregador de parâmetros no módulo.

##### Returns

`string`

#### Inherited from

`ExtensionFunction.loaderName`

***

### module

#### Get Signature

> **get** **module**(): `WgslModule`

Defined in: [scene/contracts/ExtensionFunction.ts:201](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/ExtensionFunction.ts#L201)

Módulo gerado do código atual (struct, carregador e código).

##### Returns

`WgslModule`

#### Inherited from

`ExtensionFunction.module`

***

### paramsStruct

#### Get Signature

> **get** **paramsStruct**(): `string`

Defined in: [scene/contracts/ExtensionFunction.ts:211](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/ExtensionFunction.ts#L211)

Nome do struct de parâmetros gerado.

##### Returns

`string`

#### Inherited from

`ExtensionFunction.paramsStruct`

***

### projects

#### Get Signature

> **get** **projects**(): `boolean`

Defined in: [elements/extension/CameraFunction.ts:31](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/extension/CameraFunction.ts#L31)

A função define `camera_project` (projeção de ponto no desenho).

##### Returns

`boolean`

***

### rawData

#### Get Signature

> **get** `protected` **rawData**(): `Readonly`\<`TData`\>

Defined in: [scene/contracts/Entity.ts:110](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/Entity.ts#L110)

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

Defined in: [scene/contracts/ExtensionFunction.ts:206](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/ExtensionFunction.ts#L206)

Revisão do código (sobe a cada `setCode`).

##### Returns

`number`

#### Inherited from

`ExtensionFunction.revision`

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:118](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/Entity.ts#L118)

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

Defined in: [scene/contracts/ExtensionFunction.ts:235](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/ExtensionFunction.ts#L235)

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

Defined in: [scene/contracts/Entity.ts:127](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/Entity.ts#L127)

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

Defined in: [scene/contracts/ExtensionFunction.ts:250](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/ExtensionFunction.ts#L250)

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

Defined in: [scene/contracts/ExtensionFunction.ts:254](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/ExtensionFunction.ts#L254)

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

Defined in: [scene/contracts/ExtensionFunction.ts:223](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/ExtensionFunction.ts#L223)

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

Defined in: [scene/contracts/ExtensionFunction.ts:243](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/ExtensionFunction.ts#L243)

Troca o código. Valida na hora (lança como na criação, e o código anterior continua); a revisão sobe e o
estágio dono compila o módulo novo.

#### Parameters

##### code

`string`

#### Returns

`void`

#### Inherited from

`ExtensionFunction.setCode`
