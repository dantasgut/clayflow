[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / FluidField

# Class: FluidField

Defined in: [src/elements/fields/FluidField.ts:121](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/fields/FluidField.ts#L121)

Campo dos fluidos (Camada 3, spec 033, R11): a superfície contínua dos corpos de fluido (`isFieldBody`: o `FluidBody`
com a função `material` — a aparência pelo grafo, spec 034 T065d) como distância com sinal no espaço, construída na GPU a cada quadro pelo `FluidFieldFlow` (sem
mudança de autoria: o material na entidade basta). Grade esparsa em blocos de 8³ voxels de ½ espaçamento de partícula, só onde há
partículas, por núcleos anisotrópicos e redistanciamento — superfícies planas ficam planas, gotas separadas não se
fundem, a normal é contínua. O que quem consulta lê (`fields`: os limites, a tabela dos blocos, os blocos e o atlas
dos voxels com a borda — uma página de 12³ por bloco, T060f) fica num buffer só (`data`, uma ligação de storage: cabe
ao lado dos da luz rebatida), mais a contagem:
a câmera, a luz, os raios das sondas e a luz rebatida enxergam a mesma superfície. Um por cena, inserido pelos estágios padrão; as capacidades crescem com as partículas (`reserve`).

## Extends

- [`Entity`](Entity.md)\<[`FluidFieldData`](../interfaces/FluidFieldData.md)\>

## Implements

- [`Resource`](../../platform/web/interfaces/Resource.md)

## Constructors

### Constructor

> **new FluidField**(): `FluidField`

Defined in: [src/elements/fields/FluidField.ts:127](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/fields/FluidField.ts#L127)

#### Returns

`FluidField`

#### Overrides

[`Entity`](Entity.md).[`constructor`](Entity.md#constructor)

## Properties

### state

> **state**: [`ResourceState`](../../platform/web/enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [src/elements/fields/FluidField.ts:125](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/fields/FluidField.ts#L125)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`state`](../../platform/web/interfaces/Resource.md#state)

***

### schema

> `readonly` `static` **schema**: [`StructSchema`](../../platform/web/classes/StructSchema.md) = `FluidFieldSchema`

Defined in: [src/elements/fields/FluidField.ts:123](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/fields/FluidField.ts#L123)

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

### capacity

#### Get Signature

> **get** **capacity**(): [`FluidFieldCapacity`](../interfaces/FluidFieldCapacity.md)

Defined in: [src/elements/fields/FluidField.ts:268](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/fields/FluidField.ts#L268)

Capacidades atuais (blocos e baldes da tabela).

##### Returns

[`FluidFieldCapacity`](../interfaces/FluidFieldCapacity.md)

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

***

### volume

#### Get Signature

> **get** **volume**(): `boolean`

Defined in: [src/elements/fields/FluidField.ts:200](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/fields/FluidField.ts#L200)

O campo contribui para os raios (há corpos de fluido com partículas na cena)?

##### Returns

`boolean`

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

Defined in: [src/elements/fields/FluidField.ts:137](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/fields/FluidField.ts#L137)

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

Defined in: [src/elements/fields/FluidField.ts:185](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/fields/FluidField.ts#L185)

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

Defined in: [src/elements/fields/FluidField.ts:195](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/fields/FluidField.ts#L195)

Os raios atravessam o fluido (spec 033): o cruzamento com a superfície (`ray_volume_hit`), o material nele
(`ray_volume_surface`, spec 034 T065d) e a absorção pelos trechos dentro dele (`ray_volume_transmittance`) — só
com fluido na cena (`volume` = 1). Os três com a mesma ordem: o `source` do acerto é a posição no ponto. E a
película de água que o fluido deixa nos sólidos (`scene_wetness`, spec 034), que quem sombreia uma superfície lê.

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

[`FluidFieldData`](../interfaces/FluidFieldData.md)

#### Returns

`void`

#### Inherited from

[`Entity`](Entity.md).[`redescribe`](Entity.md#redescribe)

***

### reserve()

> **reserve**(`needed`): `boolean`

Defined in: [src/elements/fields/FluidField.ts:273](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/fields/FluidField.ts#L273)

Garante as capacidades pedidas (potências de dois); devolve `true` quando alguma cresceu (buffers realocados).

#### Parameters

##### needed

[`FluidFieldCapacity`](../interfaces/FluidFieldCapacity.md)

#### Returns

`boolean`

***

### setVolume()

> **setVolume**(`on`): `void`

Defined in: [src/elements/fields/FluidField.ts:205](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/fields/FluidField.ts#L205)

Liga ou desliga a contribuição aos raios (estado `volume`, escrito só quando muda).

#### Parameters

##### on

`boolean`

#### Returns

`void`
