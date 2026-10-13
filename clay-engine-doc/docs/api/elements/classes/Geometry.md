[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / Geometry

# Abstract Class: Geometry

Defined in: [elements/geometry/Geometry.ts:16](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/geometry/Geometry.ts#L16)

Base das geometrias (C3): vértices intercalados em `data.vertices` e índices em `data.indices`, declarados como
descritores `vertex`/`index` que a C2 aloca. Também é o critério de reconhecimento de geometria pelos estágios
(`instanceof Geometry`, que sobrevive à minificação).

## Extends

- [`Entity`](Entity.md)

## Extended by

- [`BoxGeometry`](BoxGeometry.md)
- [`SphereGeometry`](SphereGeometry.md)
- [`PlaneGeometry`](PlaneGeometry.md)
- [`PointCloudGeometry`](PointCloudGeometry.md)
- [`ParametricGeometry`](ParametricGeometry.md)

## Implements

- `Resource`

## Constructors

### Constructor

> **new Geometry**(): `Geometry`

#### Returns

`Geometry`

#### Inherited from

[`Entity`](Entity.md).[`constructor`](Entity.md#constructor)

## Properties

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/geometry/Geometry.ts:17](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/geometry/Geometry.ts#L17)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

`Resource.state`

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

### contentKey

#### Get Signature

> **get** **contentKey**(): `string` \| `undefined`

Defined in: [elements/geometry/Geometry.ts:30](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/geometry/Geometry.ts#L30)

Chave de conteúdo (spec 007): geometrias com a mesma chave compartilham os buffers de vértice e índice na GPU (a
Camada 2 deduplica). Paramétricas: a dos parâmetros; arrays próprios: a do hash dos bytes. `undefined` sem
vértices e índices em `data` (ex.: nuvem de pontos produzida na GPU, que é sempre própria).

##### Returns

`string` \| `undefined`

#### Implementation of

`Resource.contentKey`

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

### indexCount

#### Get Signature

> **get** `abstract` **indexCount**(): `number`

Defined in: [elements/geometry/Geometry.ts:41](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/geometry/Geometry.ts#L41)

Número de índices (0 = sem index buffer, draw não-indexed).

##### Returns

`number`

***

### indexFormat

#### Get Signature

> **get** **indexFormat**(): `GPUIndexFormat`

Defined in: [elements/geometry/Geometry.ts:44](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/geometry/Geometry.ts#L44)

Formato do index buffer, derivado do array de índices (`Uint32Array` → `'uint32'`).

##### Returns

`GPUIndexFormat`

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

***

### vertexCount

#### Get Signature

> **get** `abstract` **vertexCount**(): `number`

Defined in: [elements/geometry/Geometry.ts:39](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/geometry/Geometry.ts#L39)

Número de vértices na geometria — usado para `pass.draw(count)`.

##### Returns

`number`

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

> `abstract` **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/geometry/Geometry.ts:19](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/geometry/Geometry.ts#L19)

Lista de bindings GPU (uniform/storage buffers, texturas, samplers)
que este resource expõe ao `ResourceSystem`. Cada descriptor define
`id`, `role`, `schema` (StructSchema) e opcionalmente `storage`
(`'pool'` para coalescer N members do mesmo schema em 1 buffer).

#### Returns

readonly `GPUDescriptor`[]

#### Implementation of

`Resource.getDescriptors`

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/geometry/Geometry.ts:21](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/geometry/Geometry.ts#L21)

Pipelines GPU declaradas pelo resource (shader source + entry points
+ consumes). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly `PipelineDescriptor`[]

#### Implementation of

`Resource.getPipelineDescriptors`

***

### indexArray()

> `protected` `static` **indexArray**(`indices`, `vertexCount`): `Uint16Array`\<`ArrayBufferLike`\> \| `Uint32Array`\<`ArrayBufferLike`\>

Defined in: [elements/geometry/Geometry.ts:52](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/geometry/Geometry.ts#L52)

Array de índices no menor formato que endereça `vertexCount` vértices: `Uint16Array` até 65 535 vértices,
`Uint32Array` acima.

#### Parameters

##### indices

readonly `number`[]

##### vertexCount

`number`

#### Returns

`Uint16Array`\<`ArrayBufferLike`\> \| `Uint32Array`\<`ArrayBufferLike`\>
