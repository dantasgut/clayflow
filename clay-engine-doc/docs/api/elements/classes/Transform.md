[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / Transform

# Class: Transform

Defined in: [src/elements/scene/Transform.ts:42](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Transform.ts#L42)

Transform 3D — a **intenção** de posicionamento de um objeto: posição, rotação
(quaternion) e escala. Mutar `data` depois de inserir reposiciona o objeto no
quadro seguinte, sem chamadas manuais.

A matriz de mundo não é dado do desenvolvedor: é produzida na GPU pelo
`TransformFlow` (fase `transform`) num segundo descritor do mesmo recurso
(`WorldTransform`, mesmo slot), e lida pelos estágios de sombra e desenho.

Mudança incompatível: o antigo campo `model` foi removido — ver o guia de migração.

## Extends

- [`Entity`](Entity.md)\<[`TransformData`](../interfaces/TransformData.md)\>

## Implements

- [`Resource`](../../platform/web/interfaces/Resource.md)

## Constructors

### Constructor

> **new Transform**(`values?`): `Transform`

Defined in: [src/elements/scene/Transform.ts:80](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Transform.ts#L80)

#### Parameters

##### values?

[`TransformValues`](../interfaces/TransformValues.md) = `{}`

#### Returns

`Transform`

#### Overrides

[`Entity`](Entity.md).[`constructor`](Entity.md#constructor)

## Properties

### state

> **state**: [`ResourceState`](../../platform/web/enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [src/elements/scene/Transform.ts:78](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Transform.ts#L78)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`state`](../../platform/web/interfaces/Resource.md#state)

***

### previousWorldSchema

> `readonly` `static` **previousWorldSchema**: [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/elements/scene/Transform.ts:64](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Transform.ts#L64)

A `WorldTransform` do quadro anterior (spec 034, pool `PreviousWorldTransform`, mesmo slot e layout): copiada no
início de cada quadro, antes de qualquer escrita nas matrizes de mundo — os vetores de movimento do antisserrilhado
temporal.

***

### schema

> `readonly` `static` **schema**: [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/elements/scene/Transform.ts:44](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Transform.ts#L44)

Intenção do desenvolvedor: posição, rotação e escala (pool `Transform`).

***

### worldInverseSchema

> `readonly` `static` **worldInverseSchema**: [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/elements/scene/Transform.ts:74](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Transform.ts#L74)

A inversa afim da matriz de mundo (spec 037, pool `WorldInverse`, mesmo slot): calculada uma vez pelo estágio de
transformação para quem leva pontos de volta ao espaço do objeto (a refração, a estrutura de raios, o colisor).
Sob demanda: só ocupa memória depois que um estágio a pede (`ResourceDirectory.ensurePoolAllocated`).

***

### worldSchema

> `readonly` `static` **worldSchema**: [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/elements/scene/Transform.ts:54](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Transform.ts#L54)

Produto do estágio de transformação, só na GPU (pool `WorldTransform`):
`world = T·R·S` e `normal = R·S⁻¹` (matriz para normais).

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

### mirrored

#### Get Signature

> **get** **mirrored**(): `boolean`

Defined in: [src/elements/scene/Transform.ts:94](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Transform.ts#L94)

Escala com produto negativo: o objeto é espelhado (inverte a orientação das faces). Lida do dado cru (os estágios a
consultam para a chave de grupo, sem criar proxy por entidade).

##### Returns

`boolean`

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

Defined in: [src/elements/scene/Transform.ts:100](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Transform.ts#L100)

Intenção (CPU envia a cada mutação) + matriz de mundo (produzida só pela GPU).

#### Returns

readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`getDescriptors`](../../platform/web/interfaces/Resource.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

Defined in: [src/elements/scene/Transform.ts:134](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Transform.ts#L134)

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

[`TransformData`](../interfaces/TransformData.md)

#### Returns

`void`

#### Inherited from

[`Entity`](Entity.md).[`redescribe`](Entity.md#redescribe)

***

### lookRotation()

> `static` **lookRotation**(`from`, `to`, `up?`): \[`number`, `number`, `number`, `number`\]

Defined in: [src/elements/scene/Transform.ts:143](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Transform.ts#L143)

Rotação (quaternion `[x, y, z, w]`) de um objeto em `from` que olha para `to` com o "para cima" `up` — a
convenção da câmera: o objeto olha para −Z local. Vocabulário de autoria: o resultado vai em
`Transform.data.rotation`.

#### Parameters

##### from

readonly `number`[]

##### to

readonly `number`[]

##### up?

readonly `number`[] = `...`

#### Returns

\[`number`, `number`, `number`, `number`\]

***

### resetLegacyModelWarning()

> `static` **resetLegacyModelWarning**(): `void`

Defined in: [src/elements/scene/Transform.ts:188](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Transform.ts#L188)

Reabilita o aviso de `model` legado (uso em testes).

#### Returns

`void`
