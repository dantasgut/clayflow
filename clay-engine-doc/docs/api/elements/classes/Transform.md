[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / Transform

# Class: Transform

Defined in: [elements/scene/Transform.ts:32](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/scene/Transform.ts#L32)

Transform 3D — a **intenção** de posicionamento de um objeto: posição, rotação
(quaternion) e escala. Mutar `data` depois de inserir reposiciona o objeto no
quadro seguinte, sem chamadas manuais.

A matriz de mundo não é dado do desenvolvedor: é produzida na GPU pelo
`TransformFlow` (fase `transform`) num segundo descritor do mesmo recurso
(`WorldTransform`, mesmo slot), e lida pelos estágios de sombra e desenho.

Mudança incompatível: o antigo campo `model` foi removido — ver o guia de migração.

## Extends

- [`Entity`](Entity.md)

## Implements

- `Resource`

## Constructors

### Constructor

> **new Transform**(`values?`): `Transform`

Defined in: [elements/scene/Transform.ts:51](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/scene/Transform.ts#L51)

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

Defined in: [elements/scene/Transform.ts:49](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/scene/Transform.ts#L49)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

`Resource.state`

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/scene/Transform.ts:34](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/scene/Transform.ts#L34)

Intenção do desenvolvedor: posição, rotação e escala (pool `Transform`).

***

### worldSchema

> `readonly` `static` **worldSchema**: `StructSchema`

Defined in: [elements/scene/Transform.ts:44](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/scene/Transform.ts#L44)

Produto do estágio de transformação, só na GPU (pool `WorldTransform`):
`world = T·R·S` e `normal = R·S⁻¹` (matriz para normais).

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)[]

Defined in: [scene/contracts/Entity.ts:125](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/scene/contracts/Entity.ts#L125)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](Entity.md)[]

#### Inherited from

[`Entity`](Entity.md).[`attached`](Entity.md#attached)

***

### data

#### Get Signature

> **get** **data**(): `Record`\<`string`, `unknown`\>

Defined in: [scene/contracts/Entity.ts:88](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/scene/contracts/Entity.ts#L88)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`Record`\<`string`, `unknown`\>

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [scene/contracts/Entity.ts:94](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/scene/contracts/Entity.ts#L94)

Troca o dado inteiro; na cena, o recurso inteiro é marcado para envio.

##### Parameters

###### next

`Record`\<`string`, `unknown`\>

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

Defined in: [elements/scene/Transform.ts:65](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/scene/Transform.ts#L65)

Escala com produto negativo: o objeto é espelhado (inverte a orientação das faces). Lida do dado cru (os estágios a
consultam para a chave de grupo, sem criar proxy por entidade).

##### Returns

`boolean`

***

### rawData

#### Get Signature

> **get** `protected` **rawData**(): `Readonly`\<`Record`\<`string`, `unknown`\>\>

Defined in: [scene/contracts/Entity.ts:108](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/scene/contracts/Entity.ts#L108)

O dado cru, sem o proxy reativo — para leituras do próprio Resource (ex.: uma propriedade derivada consultada pelos
estágios) que não devem criar proxies aninhados. Escrever por aqui não marca o recurso.

##### Returns

`Readonly`\<`Record`\<`string`, `unknown`\>\>

#### Inherited from

[`Entity`](Entity.md).[`rawData`](Entity.md#rawdata)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:116](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/scene/contracts/Entity.ts#L116)

Anexa uma Entity-filha. Retorna `this` para chaining fluente.
Não valida ciclos nem múltiplos pais — responsabilidade do caller.

#### Parameters

##### e

[`Entity`](Entity.md)

#### Returns

`this`

#### Inherited from

[`Entity`](Entity.md).[`add`](Entity.md#add)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/scene/Transform.ts:71](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/scene/Transform.ts#L71)

Intenção (CPU envia a cada mutação) + matriz de mundo (produzida só pela GPU).

#### Returns

readonly `GPUDescriptor`[]

#### Implementation of

`Resource.getDescriptors`

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/scene/Transform.ts:90](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/scene/Transform.ts#L90)

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

Defined in: [elements/scene/Transform.ts:99](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/scene/Transform.ts#L99)

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

Defined in: [elements/scene/Transform.ts:144](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/scene/Transform.ts#L144)

Reabilita o aviso de `model` legado (uso em testes).

#### Returns

`void`
