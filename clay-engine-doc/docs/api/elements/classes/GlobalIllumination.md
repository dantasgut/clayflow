[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / GlobalIllumination

# Class: GlobalIllumination

Defined in: [src/elements/lighting/GlobalIllumination.ts:237](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L237)

Iluminação global (Camada 3, spec 033): a luz rebatida da cena, física e estável, sem mudar materiais nem desenho.
Sondas em cascatas centradas na câmera lançam raios pela estrutura de raios (`RayScene`); cada acerto é sombreado com
o material da entidade (as mesmas funções `material` do desenho), a luz direta com raio de sombra e a irradiância das
sondas do rebatimento anterior; os raios que escapam leem o céu. As sondas guardam a irradiância e a visibilidade em
mapas octaédricos (a visibilidade de Chebyshev impede o vazamento pelas paredes) com acúmulo temporal no espaço delas.
Sobre elas, a coleta final na tela: sondas de tela nas superfícies visíveis lançam os próprios raios (o primeiro
rebatimento exato de perto; os seguintes pelas sondas de tela do quadro anterior e, fora da tela, pelas do mundo) e são
filtradas pelo ruído estimado. O acúmulo das duas tem histerese adaptativa: parado, converge e fica estável; quando a
luz muda de verdade (uma luz acende, a geometria muda), responde em poucos quadros sem rastro.
As cáusticas (a luz pelos caminhos especulares) são do recurso `Caustics` (spec 034). A luz indireta chega ao desenho pelo
ponto `scene_indirect_lighting` (`closure_indirect`); com ela na cena, os estágios padrão retiram o hemisfério. Mudar valores
vale no quadro seguinte, sem recompilar.

## Extends

- [`Entity`](Entity.md)\<[`GlobalIlluminationData`](../interfaces/GlobalIlluminationData.md)\>

## Implements

- [`Resource`](../../platform/web/interfaces/Resource.md)

## Constructors

### Constructor

> **new GlobalIllumination**(`values?`): `GlobalIllumination`

Defined in: [src/elements/lighting/GlobalIllumination.ts:248](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L248)

#### Parameters

##### values?

[`GlobalIlluminationValues`](../interfaces/GlobalIlluminationValues.md) = `{}`

#### Returns

`GlobalIllumination`

#### Overrides

[`Entity`](Entity.md).[`constructor`](Entity.md#constructor)

## Properties

### authored

> `readonly` **authored**: `ReadonlySet`\<`GlobalIlluminationProfileField`\>

Defined in: [src/elements/lighting/GlobalIllumination.ts:246](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L246)

Os valores da qualidade fixados pela autoria (na construção, ou todos por `quality`): o perfil do `Renderer` não
os muda; os outros vêm dele (spec 034, T079).

***

### state

> **state**: [`ResourceState`](../../platform/web/enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [src/elements/lighting/GlobalIllumination.ts:241](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L241)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`state`](../../platform/web/interfaces/Resource.md#state)

***

### schema

> `readonly` `static` **schema**: [`StructSchema`](../../platform/web/classes/StructSchema.md) = `GlobalIlluminationSchema`

Defined in: [src/elements/lighting/GlobalIllumination.ts:239](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L239)

Parâmetros (uniform).

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

Dados runtime do resource (e.g. Camera position, Material albedo,
RigidBody mass). Schema é declarado em `getDescriptors()[i].schema`.
Mutações devem disparar evento `resourceDirty` para re-upload. O tipo
concreto vem do parâmetro de `Entity<TData>`; o motor lê os campos pelo
schema.

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`data`](../../platform/web/interfaces/Resource.md#data)

#### Inherited from

[`Entity`](Entity.md).[`data`](Entity.md#data)

***

### quality

#### Set Signature

> **set** **quality**(`q`): `void`

Defined in: [src/elements/lighting/GlobalIllumination.ts:280](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L280)

Aplica uma qualidade (raios por sonda, fração por quadro, sondas de tela), fixada pela autoria.

##### Parameters

###### q

[`GlobalIlluminationQuality`](../type-aliases/GlobalIlluminationQuality.md)

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

### fromRenderer()

> **fromRenderer**(`values`, `lightPath`): `void`

Defined in: [src/elements/lighting/GlobalIllumination.ts:295](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L295)

Os valores do `Renderer` (spec 034, T079): os da qualidade que a autoria não fixou e o caminho de luz. Só escreve
o que muda.

#### Parameters

##### values

`Readonly`\<`Record`\<`GlobalIlluminationProfileField`, `number`\>\>

##### lightPath

`boolean`

#### Returns

`void`

***

### getDescriptors()

> **getDescriptors**(): readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

Defined in: [src/elements/lighting/GlobalIllumination.ts:320](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L320)

Lista de bindings GPU (uniform/storage buffers, texturas, samplers)
que este resource expõe ao `ResourceSystem`. Cada descriptor define
`id`, `role`, `schema` (StructSchema) e opcionalmente `storage`
(`'pool'` para coalescer N members do mesmo schema em 1 buffer).

#### Returns

readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`getDescriptors`](../../platform/web/interfaces/Resource.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

Defined in: [src/elements/lighting/GlobalIllumination.ts:393](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L393)

Pipelines GPU declaradas pelo resource (shader e entry points; recursos
pelos módulos declarados). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`getPipelineDescriptors`](../../platform/web/interfaces/Resource.md#getpipelinedescriptors)

***

### getSceneContributions()

> **getSceneContributions**(): readonly `SceneContribution`[]

Defined in: [src/elements/lighting/GlobalIllumination.ts:398](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L398)

A luz indireta em `scene_indirect_lighting` (e as cáusticas).

#### Returns

readonly `SceneContribution`[]

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`getSceneContributions`](../../platform/web/interfaces/Resource.md#getscenecontributions)

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

[`GlobalIlluminationData`](../interfaces/GlobalIlluminationData.md)

#### Returns

`void`

#### Inherited from

[`Entity`](Entity.md).[`redescribe`](Entity.md#redescribe)

***

### reserveScreenHistory()

> **reserveScreenHistory**(`records`): `void`

Defined in: [src/elements/lighting/GlobalIllumination.ts:314](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L314)

Reserva o histórico das sondas de tela para `records` vec4f por fatia (o estágio das sondas, quando o alvo ou as
gerações mudam): realoca as duas fatias do canal (o histórico recomeça).

#### Parameters

##### records

`number`

#### Returns

`void`

***

### validate()

> **validate**(): `void`

Defined in: [src/elements/lighting/GlobalIllumination.ts:306](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L306)

Valida os valores atuais (o estágio chama antes de usá-los; um valor inválido mantém o anterior).

#### Returns

`void`
