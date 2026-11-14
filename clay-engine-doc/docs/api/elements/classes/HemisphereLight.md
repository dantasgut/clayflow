[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / HemisphereLight

# Class: HemisphereLight

Defined in: [src/elements/scene/HemisphereLight.ts:51](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/HemisphereLight.ts#L51)

Luz ambiente de hemisfério (spec 011): um céu e um chão de radiâncias uniformes em torno do eixo `up` — no lugar da
constante de ambiente escondida. O difuso recebe a irradiância exata do hemisfério na normal; os especulares, a
radiância na direção refletida. É uma aproximação, não luz rebatida (a iluminação global é da 033). Uma por cena,
inserida pelos estágios padrão e exposta em `defaults.ambient`; ajustável e removível (sem ela, só as luzes diretas
iluminam).

## Extends

- [`Entity`](Entity.md)\<[`HemisphereLightData`](../interfaces/HemisphereLightData.md)\>

## Implements

- [`Resource`](../../platform/web/interfaces/Resource.md)

## Constructors

### Constructor

> **new HemisphereLight**(`values?`): `HemisphereLight`

Defined in: [src/elements/scene/HemisphereLight.ts:61](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/HemisphereLight.ts#L61)

#### Parameters

##### values?

[`HemisphereLightValues`](../interfaces/HemisphereLightValues.md) = `{}`

#### Returns

`HemisphereLight`

#### Overrides

[`Entity`](Entity.md).[`constructor`](Entity.md#constructor)

## Properties

### state

> **state**: [`ResourceState`](../../platform/web/enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [src/elements/scene/HemisphereLight.ts:55](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/HemisphereLight.ts#L55)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`state`](../../platform/web/interfaces/Resource.md#state)

***

### schema

> `readonly` `static` **schema**: [`StructSchema`](../../platform/web/classes/StructSchema.md) = `HemisphereLightSchema`

Defined in: [src/elements/scene/HemisphereLight.ts:53](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/HemisphereLight.ts#L53)

Parâmetros do hemisfério (uniform, enviado a cada mutação).

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

### background

#### Get Signature

> **get** **background**(): `boolean`

Defined in: [src/elements/scene/HemisphereLight.ts:73](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/HemisphereLight.ts#L73)

O hemisfério é o fundo visível?

##### Returns

`boolean`

#### Set Signature

> **set** **background**(`on`): `void`

Defined in: [src/elements/scene/HemisphereLight.ts:78](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/HemisphereLight.ts#L78)

Liga ou desliga o hemisfério como fundo visível (a composição dos pontos de cena se refaz no envio).

##### Parameters

###### on

`boolean`

##### Returns

`void`

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

### lighting

#### Get Signature

> **get** **lighting**(): `boolean`

Defined in: [src/elements/scene/HemisphereLight.ts:89](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/HemisphereLight.ts#L89)

O hemisfério ilumina as superfícies e os meios com a luz ambiente constante (padrão)? Sem, fica só como o ambiente
dos raios que escapam (`scene_environment`) e o fundo: com a iluminação global, a luz que volta do céu e do chão é
a das sondas, que o veem ao escapar com a oclusão da cena (os estágios padrão desligam isto com a GI, spec 034).

##### Returns

`boolean`

#### Set Signature

> **set** **lighting**(`on`): `void`

Defined in: [src/elements/scene/HemisphereLight.ts:93](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/HemisphereLight.ts#L93)

##### Parameters

###### on

`boolean`

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

### getDescriptors()

> **getDescriptors**(): readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

Defined in: [src/elements/scene/HemisphereLight.ts:99](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/HemisphereLight.ts#L99)

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

Defined in: [src/elements/scene/HemisphereLight.ts:103](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/HemisphereLight.ts#L103)

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

Defined in: [src/elements/scene/HemisphereLight.ts:113](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/HemisphereLight.ts#L113)

O hemisfério no ponto `scene_direct_lighting`, para os meios participantes em `scene_ambient` (spec 033; os dois só
com `lighting`) e, para
quem traça raios, em `scene_environment` (o ambiente visto ao escapar, spec 034 T065f) e, o mesmo céu e chão, em
`scene_background` (o fundo visível, T066) quando `background` está ligado.

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

[`HemisphereLightData`](../interfaces/HemisphereLightData.md)

#### Returns

`void`

#### Inherited from

[`Entity`](Entity.md).[`redescribe`](Entity.md#redescribe)
