[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / Renderer

# Class: Renderer

Defined in: [src/elements/render/Renderer.ts:179](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L179)

Renderer — a configuração do desenho de uma cena num lugar só (spec 039, FR-010/FR-011): os caminhos de luz, as
cáusticas, a luz global, a névoa, as sombras (spec 034, T079), o antisserrilhado, o filtro temporal e o perfil de
qualidade que preenche os valores. A refração de cada
objeto continua no material dele (o fechamento do grafo: transmissão, IOR, Abbe, absorção); aqui ficam só os limites
do traçado e o espaço que o desenho pode gastar.

Uma entidade com as partes que os estágios leem pelos slots (`TemporalAntialiasing`, `TemporalFilter`, `Refraction`);
as `Caustics` entram na cena com o primeiro transmissivo (os estágios padrão as inserem; sem transmissivo, a luz
global não muda). Os estágios padrão inserem um por cena; a C4 acrescenta a saída e os alvos do quadro.

## Extends

- [`Entity`](Entity.md)

## Extended by

- [`SceneRenderer`](../../presentation/classes/SceneRenderer.md)

## Constructors

### Constructor

> **new Renderer**(`options?`): `Renderer`

Defined in: [src/elements/render/Renderer.ts:210](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L210)

#### Parameters

##### options?

[`RendererOptions`](../interfaces/RendererOptions.md) = `{}`

#### Returns

`Renderer`

#### Overrides

[`Entity`](Entity.md).[`constructor`](Entity.md#constructor)

## Properties

### antialiasing

> `readonly` **antialiasing**: [`TemporalAntialiasing`](TemporalAntialiasing.md)

Defined in: [src/elements/render/Renderer.ts:181](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L181)

Antisserrilhado da cena: o modo e a sequência das posições da amostra dentro do pixel.

***

### caustics

> `readonly` **caustics**: [`CausticsSettings`](../interfaces/CausticsSettings.md)

Defined in: [src/elements/render/Renderer.ts:187](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L187)

O transporte das cáusticas.

***

### fog

> `readonly` **fog**: `FogSettings`

Defined in: [src/elements/render/Renderer.ts:193](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L193)

A névoa da cena.

***

### globalIllumination

> `readonly` **globalIllumination**: `GlobalIlluminationSettings`

Defined in: [src/elements/render/Renderer.ts:191](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L191)

A luz global da cena.

***

### lightPaths

> `readonly` **lightPaths**: [`LightPaths`](../interfaces/LightPaths.md)

Defined in: [src/elements/render/Renderer.ts:185](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L185)

Os limites dos caminhos traçados.

***

### shadows

> `readonly` **shadows**: `ShadowSettings`

Defined in: [src/elements/render/Renderer.ts:195](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L195)

As sombras da cena.

***

### temporalFilter

> `readonly` **temporalFilter**: [`TemporalFilter`](TemporalFilter.md)

Defined in: [src/elements/render/Renderer.ts:183](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L183)

Acumulador temporal de pixel (o filtro do sinal traçado).

***

### tracing

> `readonly` **tracing**: [`TracingSettings`](../interfaces/TracingSettings.md)

Defined in: [src/elements/render/Renderer.ts:189](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L189)

A distribuição do traçado pelos quadros.

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

[`Entity`](Entity.md).[`attached`](Entity.md#attached)

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

#### Inherited from

[`Entity`](Entity.md).[`data`](Entity.md#data)

***

### profile

#### Get Signature

> **get** **profile**(): [`RenderProfile`](../type-aliases/RenderProfile.md)

Defined in: [src/elements/render/Renderer.ts:342](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L342)

O perfil de qualidade.

##### Returns

[`RenderProfile`](../type-aliases/RenderProfile.md)

#### Set Signature

> **set** **profile**(`profile`): `void`

Defined in: [src/elements/render/Renderer.ts:351](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L351)

Troca o perfil: o quadro seguinte usa os valores dele; o espaço de trabalho dos estágios cresce ou encolhe com
eles (spec 039, a C2 realoca). Ajustes feitos depois (ex.: `lightPaths.transmission`) valem por cima do perfil.

##### Throws

RangeError para um perfil desconhecido.

##### Parameters

###### profile

[`RenderProfile`](../type-aliases/RenderProfile.md)

##### Returns

`void`

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

[`Entity`](Entity.md).[`rawData`](Entity.md#rawdata)

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

[`Entity`](Entity.md).[`add`](Entity.md#add)

***

### adopt()

> **adopt**(`resource`): `void`

Defined in: [src/elements/render/Renderer.ts:376](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L376)

Passa a seguir o renderizador (spec 034, T079): a luz global, os froxels e os mapas de sombra da cena recebem os
valores dele agora e a cada mudança (o perfil, um ajuste). Os estágios padrão adotam os que entram na cena.

#### Parameters

##### resource

[`GlobalIllumination`](GlobalIllumination.md) \| [`Froxels`](Froxels.md) \| [`ShadowMap`](ShadowMap.md)

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

[`Entity`](Entity.md)\<`object`\>

#### Returns

`boolean`

#### Inherited from

[`Entity`](Entity.md).[`detach`](Entity.md#detach)

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

`TData`

#### Returns

`void`

#### Inherited from

[`Entity`](Entity.md).[`redescribe`](Entity.md#redescribe)

***

### release()

> **release**(`resource`): `void`

Defined in: [src/elements/render/Renderer.ts:382](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L382)

Deixa de seguir (o recurso saiu da cena).

#### Parameters

##### resource

[`GlobalIllumination`](GlobalIllumination.md) \| [`Froxels`](Froxels.md) \| [`ShadowMap`](ShadowMap.md)

#### Returns

`void`
