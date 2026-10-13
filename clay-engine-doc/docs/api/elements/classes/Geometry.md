[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / Geometry

# Abstract Class: Geometry\<TData\>

Defined in: [elements/geometry/Geometry.ts:25](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/geometry/Geometry.ts#L25)

Base das geometrias (C3): vértices intercalados em `data.vertices` e índices em `data.indices`, declarados como
descritores `vertex`/`index` que a C2 aloca. Também é o critério de reconhecimento de geometria pelos estágios
(`instanceof Geometry`, que sobrevive à minificação).

## Extends

- [`Entity`](Entity.md)\<`TData`\>

## Extended by

- [`BoxGeometry`](BoxGeometry.md)
- [`SphereGeometry`](SphereGeometry.md)
- [`PlaneGeometry`](PlaneGeometry.md)
- [`PointCloudGeometry`](PointCloudGeometry.md)
- [`ParametricGeometry`](ParametricGeometry.md)

## Type Parameters

### TData

`TData` *extends* [`GeometryData`](../interfaces/GeometryData.md) = [`GeometryData`](../interfaces/GeometryData.md)

## Implements

- `Resource`

## Constructors

### Constructor

> **new Geometry**\<`TData`\>(): `Geometry`\<`TData`\>

#### Returns

`Geometry`\<`TData`\>

#### Inherited from

[`Entity`](Entity.md).[`constructor`](Entity.md#constructor)

## Properties

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/geometry/Geometry.ts:29](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/geometry/Geometry.ts#L29)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

`Resource.state`

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)\<`object`\>[]

Defined in: [scene/contracts/Entity.ts:127](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/scene/contracts/Entity.ts#L127)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](Entity.md)\<`object`\>[]

#### Inherited from

[`Entity`](Entity.md).[`attached`](Entity.md#attached)

***

### contentKey

#### Get Signature

> **get** **contentKey**(): `string` \| `undefined`

Defined in: [elements/geometry/Geometry.ts:42](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/geometry/Geometry.ts#L42)

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

> **get** **data**(): `TData`

Defined in: [scene/contracts/Entity.ts:90](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/scene/contracts/Entity.ts#L90)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`TData`

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [scene/contracts/Entity.ts:96](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/scene/contracts/Entity.ts#L96)

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

### indexCount

#### Get Signature

> **get** `abstract` **indexCount**(): `number`

Defined in: [elements/geometry/Geometry.ts:53](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/geometry/Geometry.ts#L53)

Número de índices (0 = sem index buffer, draw não-indexed).

##### Returns

`number`

***

### indexFormat

#### Get Signature

> **get** **indexFormat**(): `GPUIndexFormat`

Defined in: [elements/geometry/Geometry.ts:56](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/geometry/Geometry.ts#L56)

Formato do index buffer, derivado do array de índices (`Uint32Array` → `'uint32'`).

##### Returns

`GPUIndexFormat`

***

### rawData

#### Get Signature

> **get** `protected` **rawData**(): `Readonly`\<`TData`\>

Defined in: [scene/contracts/Entity.ts:110](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/scene/contracts/Entity.ts#L110)

O dado cru, sem o proxy reativo — para leituras do próprio Resource (ex.: uma propriedade derivada consultada pelos
estágios) que não devem criar proxies aninhados. Escrever por aqui não marca o recurso.

##### Returns

`Readonly`\<`TData`\>

#### Inherited from

[`Entity`](Entity.md).[`rawData`](Entity.md#rawdata)

***

### vertexCount

#### Get Signature

> **get** `abstract` **vertexCount**(): `number`

Defined in: [elements/geometry/Geometry.ts:51](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/geometry/Geometry.ts#L51)

Número de vértices na geometria — usado para `pass.draw(count)`.

##### Returns

`number`

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:118](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/scene/contracts/Entity.ts#L118)

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

> `abstract` **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/geometry/Geometry.ts:31](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/geometry/Geometry.ts#L31)

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

Defined in: [elements/geometry/Geometry.ts:33](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/geometry/Geometry.ts#L33)

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

Defined in: [elements/geometry/Geometry.ts:64](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/geometry/Geometry.ts#L64)

Array de índices no menor formato que endereça `vertexCount` vértices: `Uint16Array` até 65 535 vértices,
`Uint32Array` acima.

#### Parameters

##### indices

readonly `number`[]

##### vertexCount

`number`

#### Returns

`Uint16Array`\<`ArrayBufferLike`\> \| `Uint32Array`\<`ArrayBufferLike`\>
