[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / ShadowMap

# Class: ShadowMap

Defined in: [src/elements/scene/ShadowMap.ts:107](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/ShadowMap.ts#L107)

Mapa de sombra virtual de uma luz (Camada 3; spec 034, T060 — o padrão dos mapas de sombra virtuais): níveis em volta
da câmera, cada um com o dobro do lado do anterior e a mesma resolução virtual (`size`), divididos em páginas de 128²
ancoradas no espaço da luz. Só as páginas que a imagem usa existem: a profundidade da cena de um quadro marca as
páginas pedidas (`requests`), o estágio de sombra do quadro seguinte as aloca no atlas, guarda-as na tabela de
páginas e desenha só as novas e as tocadas por quem se moveu ou se deformou — as demais seguem do quadro anterior. Sem
texturas (T060h): o atlas é um buffer só (`atlas`) com a tabela no começo (`shadowTableWords`, 4 palavras por página
virtual, refeita no lugar a cada quadro) e as páginas físicas depois, uma por registro de `SHADOW_PAGE_WORDS`
profundidades (os bits do `f32`); os pedidos, um buffer de uma palavra por página virtual. Séries temporais (spec 037):
os pedidos do quadro anterior pelo atraso 1; o atlas, série por páginas (o alvo só, com o carimbo de cada página física
e a época da C2).

Os vieses, o tamanho e o primeiro nível em pool (`array<ShadowMap>`); o referencial do quadro (a base da luz, a
câmera no espaço dela, a faixa de profundidade) num segundo descritor do mesmo slot (pool `ShadowMatrix`, produzido
só na GPU pelo `ShadowMatrixFlow`). Anexado pela `DirectionalLight` que projeta sombra.

Mudança incompatível: `lightViewProj` não é mais dado nem opção do `ShadowMap` — ver o guia de migração.

## Extends

- [`Entity`](Entity.md)\<[`ShadowMapData`](../interfaces/ShadowMapData.md)\>

## Implements

- [`Resource`](../../platform/web/interfaces/Resource.md)

## Constructors

### Constructor

> **new ShadowMap**(`options?`): `ShadowMap`

Defined in: [src/elements/scene/ShadowMap.ts:145](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/ShadowMap.ts#L145)

#### Parameters

##### options?

[`ShadowMapOptions`](../interfaces/ShadowMapOptions.md) = `{}`

#### Returns

`ShadowMap`

#### Overrides

[`Entity`](Entity.md).[`constructor`](Entity.md#constructor)

## Properties

### authored

> `readonly` **authored**: `ReadonlySet`\<`ShadowMapProfileField`\>

Defined in: [src/elements/scene/ShadowMap.ts:143](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/ShadowMap.ts#L143)

Os valores fixados pela autoria (nas opções): o perfil do `Renderer` não os muda (spec 034, T079).

***

### state

> **state**: [`ResourceState`](../../platform/web/enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [src/elements/scene/ShadowMap.ts:141](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/ShadowMap.ts#L141)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`state`](../../platform/web/interfaces/Resource.md#state)

***

### matrixSchema

> `readonly` `static` **matrixSchema**: [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/elements/scene/ShadowMap.ts:128](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/ShadowMap.ts#L128)

Produto do `ShadowMatrixFlow`, só na GPU (pool `ShadowMatrix`, mesmo slot do mapa; série temporal de 2 quadros): o
referencial do mapa virtual no quadro — `lightView` (mundo → luz: as linhas são os eixos x e y do plano da luz e a
direção da luz), a vista-projeção da câmera (zero sem câmera: a reserva grossa sem o teste do frustum), a câmera no
espaço da luz (`camera.xyz`; `camera.w` = níveis ativos), a direção da luz
(`direction.xyz`; `direction.w` = 1 quando o cache não vale neste quadro: luz, nível ou série mudados), o meio
lado do primeiro nível, a meia faixa de profundidade de uma página (m) e a rotação do padrão da penumbra e o
deslocamento das amostras dentro do texel (spec 034: pela sequência do antisserrilhado; sem ele, (1, 0) e 0).

***

### schema

> `readonly` `static` **schema**: [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/elements/scene/ShadowMap.ts:109](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/ShadowMap.ts#L109)

Parâmetros do mapa (pool `ShadowMap`): vieses e tamanho, enviados a cada mutação.

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

> **fromRenderer**(`resolution`, `penumbraSamples`): `void`

Defined in: [src/elements/scene/ShadowMap.ts:174](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/ShadowMap.ts#L174)

Os valores do `Renderer` (spec 034, T079): os que a autoria não fixou. A resolução nova realoca a textura de
profundidade pela C2.

#### Parameters

##### resolution

`number`

##### penumbraSamples

`number`

#### Returns

`void`

***

### getDescriptors()

> **getDescriptors**(): readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

Defined in: [src/elements/scene/ShadowMap.ts:196](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/ShadowMap.ts#L196)

Parâmetros (CPU envia a cada mutação) + referencial do quadro (produzido só pela GPU) + o atlas das páginas, a
tabela de páginas e os pedidos (séries temporais) + o amostrador de comparação.

#### Returns

readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`getDescriptors`](../../platform/web/interfaces/Resource.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

Defined in: [src/elements/scene/ShadowMap.ts:232](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/ShadowMap.ts#L232)

Pipelines GPU declaradas pelo resource (shader e entry points; recursos
pelos módulos declarados). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`getPipelineDescriptors`](../../platform/web/interfaces/Resource.md#getpipelinedescriptors)

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

[`ShadowMapData`](../interfaces/ShadowMapData.md)

#### Returns

`void`

#### Inherited from

[`Entity`](Entity.md).[`redescribe`](Entity.md#redescribe)
