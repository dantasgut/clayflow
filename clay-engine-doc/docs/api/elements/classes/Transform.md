[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / Transform

# Class: Transform

Defined in: [elements/scene/Transform.ts:42](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/scene/Transform.ts#L42)

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

- `Resource`

## Constructors

### Constructor

> **new Transform**(`values?`): `Transform`

Defined in: [elements/scene/Transform.ts:61](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/scene/Transform.ts#L61)

#### Parameters

##### values?

[`TransformValues`](../interfaces/TransformValues.md) = `{}`

#### Returns

`Transform`

#### Overrides

[`Entity`](Entity.md).[`constructor`](Entity.md#constructor)

## Properties

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/scene/Transform.ts:59](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/scene/Transform.ts#L59)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

`Resource.state`

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/scene/Transform.ts:44](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/scene/Transform.ts#L44)

Intenção do desenvolvedor: posição, rotação e escala (pool `Transform`).

***

### worldSchema

> `readonly` `static` **worldSchema**: `StructSchema`

Defined in: [elements/scene/Transform.ts:54](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/scene/Transform.ts#L54)

Produto do estágio de transformação, só na GPU (pool `WorldTransform`):
`world = T·R·S` e `normal = R·S⁻¹` (matriz para normais).

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)\<`object`\>[]

Defined in: [scene/contracts/Entity.ts:127](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/scene/contracts/Entity.ts#L127)

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

Defined in: [scene/contracts/Entity.ts:90](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/scene/contracts/Entity.ts#L90)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`TData`

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [scene/contracts/Entity.ts:96](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/scene/contracts/Entity.ts#L96)

Troca o dado inteiro; na cena, o recurso inteiro é marcado para envio.

##### Parameters

###### next

`TData`

##### Returns

`void`

#### Implementation of

`Resource.data`

#### Inherited from

[`Entity`](Entity.md).[`data`](Entity.md#data)

***

### mirrored

#### Get Signature

> **get** **mirrored**(): `boolean`

Defined in: [elements/scene/Transform.ts:75](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/scene/Transform.ts#L75)

Escala com produto negativo: o objeto é espelhado (inverte a orientação das faces). Lida do dado cru (os estágios a
consultam para a chave de grupo, sem criar proxy por entidade).

##### Returns

`boolean`

***

### rawData

#### Get Signature

> **get** `protected` **rawData**(): `Readonly`\<`TData`\>

Defined in: [scene/contracts/Entity.ts:110](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/scene/contracts/Entity.ts#L110)

O dado cru, sem o proxy reativo — para leituras do próprio Resource (ex.: uma propriedade derivada consultada pelos
estágios) que não devem criar proxies aninhados. Escrever por aqui não marca o recurso.

##### Returns

`Readonly`\<`TData`\>

#### Inherited from

[`Entity`](Entity.md).[`rawData`](Entity.md#rawdata)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:118](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/scene/contracts/Entity.ts#L118)

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

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/scene/Transform.ts:81](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/scene/Transform.ts#L81)

Intenção (CPU envia a cada mutação) + matriz de mundo (produzida só pela GPU).

#### Returns

readonly `GPUDescriptor`[]

#### Implementation of

`Resource.getDescriptors`

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/scene/Transform.ts:100](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/scene/Transform.ts#L100)

Pipelines GPU declaradas pelo resource (shader source + entry points
+ consumes). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly `PipelineDescriptor`[]

#### Implementation of

`Resource.getPipelineDescriptors`

***

### lookRotation()

> `static` **lookRotation**(`from`, `to`, `up?`): \[`number`, `number`, `number`, `number`\]

Defined in: [elements/scene/Transform.ts:109](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/scene/Transform.ts#L109)

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

Defined in: [elements/scene/Transform.ts:154](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/scene/Transform.ts#L154)

Reabilita o aviso de `model` legado (uso em testes).

#### Returns

`void`
