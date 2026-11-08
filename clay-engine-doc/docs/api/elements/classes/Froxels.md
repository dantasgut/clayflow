[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / Froxels

# Class: Froxels

Defined in: [src/elements/media/Froxels.ts:60](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/Froxels.ts#L60)

Froxels dos meios participantes (Camada 3, spec 033, R12): a grade alinhada à câmera (160 × 90 × 128 no perfil alto; fatias
exponenciais da profundidade) onde o `FroxelFlow` injeta, acumula no tempo e integra a névoa de todos os `FogVolume`
da cena, e o buffer dos meios (os volumes e as grades de densidade, uma ligação só). Contribui aos pontos de cena: a
névoa no desenho (`scene_fog`), a transmitância nos raios (`ray_volume_transmittance`: sondas, fótons) e na luz que
chega aos pontos (`light_transmission`: as superfícies dentro da névoa, a própria névoa) — só com névoa. Um por cena,
inserido pelos estágios padrão.

## Extends

- [`Entity`](Entity.md)\<[`FroxelsData`](../interfaces/FroxelsData.md)\>

## Implements

- [`Resource`](../../platform/web/interfaces/Resource.md)

## Constructors

### Constructor

> **new Froxels**(): `Froxels`

Defined in: [src/elements/media/Froxels.ts:68](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/Froxels.ts#L68)

#### Returns

`Froxels`

#### Overrides

[`Entity`](Entity.md).[`constructor`](Entity.md#constructor)

## Properties

### densityFunctions

> **densityFunctions**: readonly `CompositeFunction`[] = `[]`

Defined in: [src/elements/media/Froxels.ts:66](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/Froxels.ts#L66)

As funções de densidade dos volumes, na ordem dos índices gravados neles (índice k + 1 → `functions[k]`).

***

### state

> **state**: [`ResourceState`](../../platform/web/enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [src/elements/media/Froxels.ts:64](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/Froxels.ts#L64)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`state`](../../platform/web/interfaces/Resource.md#state)

***

### schema

> `readonly` `static` **schema**: [`StructSchema`](../../platform/web/classes/StructSchema.md) = `FroxelsSchema`

Defined in: [src/elements/media/Froxels.ts:62](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/Froxels.ts#L62)

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

### grid

#### Get Signature

> **get** **grid**(): readonly \[`number`, `number`, `number`\]

Defined in: [src/elements/media/Froxels.ts:81](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/Froxels.ts#L81)

Froxels por eixo.

##### Returns

readonly \[`number`, `number`, `number`\]

#### Set Signature

> **set** **grid**(`grid`): `void`

Defined in: [src/elements/media/Froxels.ts:90](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/Froxels.ts#L90)

Troca a resolução da grade (o perfil do `Renderer`, spec 034 T079): a C2 realoca as grades (o histórico
recomeça); a da luz ambiente acompanha (a cada 4 por eixo).

##### Throws

RangeError fora de 1–2048 inteiros por eixo (o mínimo garantido de textura 3D do WebGPU).

##### Parameters

###### grid

readonly \[`number`, `number`, `number`\]

##### Returns

`void`

***

### historyPrecision

#### Get Signature

> **get** **historyPrecision**(): `HistoryPrecision`

Defined in: [src/elements/media/Froxels.ts:106](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/Froxels.ts#L106)

Precisão do histórico da névoa (`half`, o padrão, ou `full`: 32 bits, dobra a banda das duas fatias). `full`
exige `float32-filterable` (o histórico é lido filtrado); sem ela, a C2 o mantém em `half` com aviso (spec 037:
a precisão de um canal temporal). Mudar realoca o histórico (recomeça).

##### Returns

`HistoryPrecision`

#### Set Signature

> **set** **historyPrecision**(`precision`): `void`

Defined in: [src/elements/media/Froxels.ts:110](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/Froxels.ts#L110)

##### Parameters

###### precision

`HistoryPrecision`

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

Defined in: [src/elements/media/Froxels.ts:116](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/Froxels.ts#L116)

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

Defined in: [src/elements/media/Froxels.ts:169](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/Froxels.ts#L169)

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

Defined in: [src/elements/media/Froxels.ts:173](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/Froxels.ts#L173)

Contribuições do Resource para pontos de cena (spec 031, R4): ex. a sombra para `light_visibility`, a água para
`light_transmission`. A C2 compõe as contribuições presentes e troca o pronto de cada ponto em todo pipeline que
o contém; os estágios não conhecem os contribuintes.

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

[`FroxelsData`](../interfaces/FroxelsData.md)

#### Returns

`void`

#### Inherited from

[`Entity`](Entity.md).[`redescribe`](Entity.md#redescribe)

***

### reserve()

> **reserve**(`words`): `boolean`

Defined in: [src/elements/media/Froxels.ts:192](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/Froxels.ts#L192)

Garante `words` vec4f no buffer dos meios (potências de dois); `true` quando cresceu (buffer realocado).

#### Parameters

##### words

`number`

#### Returns

`boolean`

***

### setActive()

> **setActive**(`on`): `void`

Defined in: [src/elements/media/Froxels.ts:178](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/Froxels.ts#L178)

Liga ou desliga as contribuições (estado `active`, escrito só quando muda).

#### Parameters

##### on

`boolean`

#### Returns

`void`

***

### setDensityFunctions()

> **setDensityFunctions**(`functions`): `void`

Defined in: [src/elements/media/Froxels.ts:184](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/Froxels.ts#L184)

Troca as funções de densidade (a composição muda: as contribuições e os kernels são refeitos).

#### Parameters

##### functions

readonly `CompositeFunction`[]

#### Returns

`void`

***

### withDensity()

> **withDensity**(`module`): [`WgslModule`](../../platform/web/interfaces/WgslModule.md)

Defined in: [src/elements/media/Froxels.ts:204](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/Froxels.ts#L204)

O módulo com as funções de densidade da cena no lugar da pronta (memorizado por revisão): os volumes compostos uma
vez (`media_volumes` com o `switch`) e trocados em cada módulo que os usa — o mesmo objeto no kernel e nas
contribuições que entram nele.

#### Parameters

##### module

[`WgslModule`](../../platform/web/interfaces/WgslModule.md)

#### Returns

[`WgslModule`](../../platform/web/interfaces/WgslModule.md)
