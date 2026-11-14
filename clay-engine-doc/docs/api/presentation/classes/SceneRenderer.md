[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / SceneRenderer

# Class: SceneRenderer

Defined in: [src/presentation/resources/SceneRenderer.ts:9](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/resources/SceneRenderer.ts#L9)

O renderizador da cena na apresentação (spec 039, D7): o `Renderer` da C3 (caminhos de luz, cáusticas,
antisserrilhado, filtro temporal, perfil) com a saída — exposição, mapeamento de tons e o formato do canvas
(`ToneMapping`), lida pelo pós. Um por cena, inserido pelos estágios padrão (`app.defaults.renderer`).

## Extends

- [`Renderer`](../../elements/classes/Renderer.md)

## Constructors

### Constructor

> **new SceneRenderer**(`options?`): `SceneRenderer`

Defined in: [src/presentation/resources/SceneRenderer.ts:13](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/resources/SceneRenderer.ts#L13)

#### Parameters

##### options?

[`RendererOptions`](../../elements/interfaces/RendererOptions.md) = `{}`

#### Returns

`SceneRenderer`

#### Overrides

[`Renderer`](../../elements/classes/Renderer.md).[`constructor`](../../elements/classes/Renderer.md#constructor)

## Properties

### antialiasing

> `readonly` **antialiasing**: [`TemporalAntialiasing`](../../elements/classes/TemporalAntialiasing.md)

Defined in: [src/elements/render/Renderer.ts:181](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L181)

Antisserrilhado da cena: o modo e a sequência das posições da amostra dentro do pixel.

#### Inherited from

[`Renderer`](../../elements/classes/Renderer.md).[`antialiasing`](../../elements/classes/Renderer.md#antialiasing)

***

### caustics

> `readonly` **caustics**: [`CausticsSettings`](../../elements/interfaces/CausticsSettings.md)

Defined in: [src/elements/render/Renderer.ts:187](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L187)

O transporte das cáusticas.

#### Inherited from

[`Renderer`](../../elements/classes/Renderer.md).[`caustics`](../../elements/classes/Renderer.md#caustics)

***

### fog

> `readonly` **fog**: `FogSettings`

Defined in: [src/elements/render/Renderer.ts:193](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L193)

A névoa da cena.

#### Inherited from

[`Renderer`](../../elements/classes/Renderer.md).[`fog`](../../elements/classes/Renderer.md#fog)

***

### globalIllumination

> `readonly` **globalIllumination**: `GlobalIlluminationSettings`

Defined in: [src/elements/render/Renderer.ts:191](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L191)

A luz global da cena.

#### Inherited from

[`Renderer`](../../elements/classes/Renderer.md).[`globalIllumination`](../../elements/classes/Renderer.md#globalillumination)

***

### lightPaths

> `readonly` **lightPaths**: [`LightPaths`](../../elements/interfaces/LightPaths.md)

Defined in: [src/elements/render/Renderer.ts:185](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L185)

Os limites dos caminhos traçados.

#### Inherited from

[`Renderer`](../../elements/classes/Renderer.md).[`lightPaths`](../../elements/classes/Renderer.md#lightpaths)

***

### output

> `readonly` **output**: [`ToneMapping`](ToneMapping.md)

Defined in: [src/presentation/resources/SceneRenderer.ts:11](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/resources/SceneRenderer.ts#L11)

A saída: exposição, mapeamento de tons e saída (`output.data.exposure = 1`).

***

### shadows

> `readonly` **shadows**: `ShadowSettings`

Defined in: [src/elements/render/Renderer.ts:195](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L195)

As sombras da cena.

#### Inherited from

[`Renderer`](../../elements/classes/Renderer.md).[`shadows`](../../elements/classes/Renderer.md#shadows)

***

### temporalFilter

> `readonly` **temporalFilter**: [`TemporalFilter`](../../elements/classes/TemporalFilter.md)

Defined in: [src/elements/render/Renderer.ts:183](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L183)

Acumulador temporal de pixel (o filtro do sinal traçado).

#### Inherited from

[`Renderer`](../../elements/classes/Renderer.md).[`temporalFilter`](../../elements/classes/Renderer.md#temporalfilter)

***

### tracing

> `readonly` **tracing**: [`TracingSettings`](../../elements/interfaces/TracingSettings.md)

Defined in: [src/elements/render/Renderer.ts:189](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L189)

A distribuição do traçado pelos quadros.

#### Inherited from

[`Renderer`](../../elements/classes/Renderer.md).[`tracing`](../../elements/classes/Renderer.md#tracing)

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](../../elements/classes/Entity.md)\<`object`\>[]

Defined in: [src/scene/contracts/Entity.ts:160](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L160)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](../../elements/classes/Entity.md)\<`object`\>[]

#### Inherited from

[`Renderer`](../../elements/classes/Renderer.md).[`attached`](../../elements/classes/Renderer.md#attached)

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

[`Renderer`](../../elements/classes/Renderer.md).[`data`](../../elements/classes/Renderer.md#data)

***

### profile

#### Get Signature

> **get** **profile**(): [`RenderProfile`](../../elements/type-aliases/RenderProfile.md)

Defined in: [src/elements/render/Renderer.ts:342](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L342)

O perfil de qualidade.

##### Returns

[`RenderProfile`](../../elements/type-aliases/RenderProfile.md)

#### Set Signature

> **set** **profile**(`profile`): `void`

Defined in: [src/elements/render/Renderer.ts:351](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L351)

Troca o perfil: o quadro seguinte usa os valores dele; o espaço de trabalho dos estágios cresce ou encolhe com
eles (spec 039, a C2 realoca). Ajustes feitos depois (ex.: `lightPaths.transmission`) valem por cima do perfil.

##### Throws

RangeError para um perfil desconhecido.

##### Parameters

###### profile

[`RenderProfile`](../../elements/type-aliases/RenderProfile.md)

##### Returns

`void`

#### Inherited from

[`Renderer`](../../elements/classes/Renderer.md).[`profile`](../../elements/classes/Renderer.md#profile)

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

[`Renderer`](../../elements/classes/Renderer.md).[`rawData`](../../elements/classes/Renderer.md#rawdata)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [src/scene/contracts/Entity.ts:140](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L140)

Anexa uma Entity-filha. Retorna `this` para chaining fluente.
Não valida ciclos nem múltiplos pais — responsabilidade do caller.

#### Parameters

##### e

[`Entity`](../../elements/classes/Entity.md)\<`object`\>

#### Returns

`this`

#### Inherited from

[`Renderer`](../../elements/classes/Renderer.md).[`add`](../../elements/classes/Renderer.md#add)

***

### adopt()

> **adopt**(`resource`): `void`

Defined in: [src/elements/render/Renderer.ts:376](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L376)

Passa a seguir o renderizador (spec 034, T079): a luz global, os froxels e os mapas de sombra da cena recebem os
valores dele agora e a cada mudança (o perfil, um ajuste). Os estágios padrão adotam os que entram na cena.

#### Parameters

##### resource

[`GlobalIllumination`](../../elements/classes/GlobalIllumination.md) \| [`Froxels`](../../elements/classes/Froxels.md) \| [`ShadowMap`](../../elements/classes/ShadowMap.md)

#### Returns

`void`

#### Inherited from

[`Renderer`](../../elements/classes/Renderer.md).[`adopt`](../../elements/classes/Renderer.md#adopt)

***

### detach()

> **detach**(`e`): `boolean`

Defined in: [src/scene/contracts/Entity.ts:149](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L149)

Desanexa uma Entity-filha direta (inverso de `add`). Devolve `false` se ela não é filha desta. Numa entidade já
inserida, use `World.detach` (que também atualiza a cena).

#### Parameters

##### e

[`Entity`](../../elements/classes/Entity.md)\<`object`\>

#### Returns

`boolean`

#### Inherited from

[`Renderer`](../../elements/classes/Renderer.md).[`detach`](../../elements/classes/Renderer.md#detach)

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

[`Renderer`](../../elements/classes/Renderer.md).[`redescribe`](../../elements/classes/Renderer.md#redescribe)

***

### release()

> **release**(`resource`): `void`

Defined in: [src/elements/render/Renderer.ts:382](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L382)

Deixa de seguir (o recurso saiu da cena).

#### Parameters

##### resource

[`GlobalIllumination`](../../elements/classes/GlobalIllumination.md) \| [`Froxels`](../../elements/classes/Froxels.md) \| [`ShadowMap`](../../elements/classes/ShadowMap.md)

#### Returns

`void`

#### Inherited from

[`Renderer`](../../elements/classes/Renderer.md).[`release`](../../elements/classes/Renderer.md#release)
