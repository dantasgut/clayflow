[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SphereGeometry

# Class: SphereGeometry

Defined in: [elements/geometry/SphereGeometry.ts:26](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/geometry/SphereGeometry.ts#L26)

SphereGeometry — esfera gerada via lat/lon tessellation. Default 16
latitude segments × 32 longitude segments = 512 quads = 1024 triangles.
Aumente `latSegments`/`lonSegments` para superfícies mais smooth.

## Extends

- [`Geometry`](Geometry.md)\<[`SphereGeometryData`](../interfaces/SphereGeometryData.md)\>

## Constructors

### Constructor

> **new SphereGeometry**(`values?`): `SphereGeometry`

Defined in: [elements/geometry/SphereGeometry.ts:36](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/geometry/SphereGeometry.ts#L36)

#### Parameters

##### values?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`SphereGeometry`

#### Overrides

[`Geometry`](Geometry.md).[`constructor`](Geometry.md#constructor)

## Properties

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/geometry/Geometry.ts:36](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/geometry/Geometry.ts#L36)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`Geometry`](Geometry.md).[`state`](Geometry.md#state)

***

### schema

> `readonly` `static` **schema**: `StructSchema` = `SphereGeometry.vertexStruct`

Defined in: [elements/geometry/SphereGeometry.ts:34](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/geometry/SphereGeometry.ts#L34)

Alias para vertexStruct.

***

### vertexStruct

> `readonly` `static` **vertexStruct**: `StructSchema`

Defined in: [elements/geometry/SphereGeometry.ts:28](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/geometry/SphereGeometry.ts#L28)

Vertex layout idêntico a BoxGeometry: position + normal + uv.

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

[`Geometry`](Geometry.md).[`attached`](Geometry.md#attached)

***

### contentKey

#### Get Signature

> **get** **contentKey**(): `string` \| `undefined`

Defined in: [elements/geometry/Geometry.ts:49](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/geometry/Geometry.ts#L49)

Chave de conteúdo (spec 007): geometrias com a mesma chave compartilham os buffers de vértice e índice na GPU (a
Camada 2 deduplica). Paramétricas: a dos parâmetros; arrays próprios: a do hash dos bytes. `undefined` sem
vértices e índices em `data` (ex.: nuvem de pontos produzida na GPU, que é sempre própria).

##### Returns

`string` \| `undefined`

#### Inherited from

[`Geometry`](Geometry.md).[`contentKey`](Geometry.md#contentkey)

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

#### Inherited from

[`Geometry`](Geometry.md).[`data`](Geometry.md#data)

***

### indexCount

#### Get Signature

> **get** **indexCount**(): `number`

Defined in: [elements/geometry/SphereGeometry.ts:82](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/geometry/SphereGeometry.ts#L82)

= lat × lon × 6 (2 triangles por quad).

##### Returns

`number`

#### Overrides

[`Geometry`](Geometry.md).[`indexCount`](Geometry.md#indexcount)

***

### indexFormat

#### Get Signature

> **get** **indexFormat**(): `GPUIndexFormat`

Defined in: [elements/geometry/Geometry.ts:73](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/geometry/Geometry.ts#L73)

Formato do index buffer, derivado do array de índices (`Uint32Array` → `'uint32'`).

##### Returns

`GPUIndexFormat`

#### Inherited from

[`Geometry`](Geometry.md).[`indexFormat`](Geometry.md#indexformat)

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

[`Geometry`](Geometry.md).[`rawData`](Geometry.md#rawdata)

***

### vertexCount

#### Get Signature

> **get** **vertexCount**(): `number`

Defined in: [elements/geometry/SphereGeometry.ts:78](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/geometry/SphereGeometry.ts#L78)

= (lat+1) × (lon+1).

##### Returns

`number`

#### Overrides

[`Geometry`](Geometry.md).[`vertexCount`](Geometry.md#vertexcount)

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

[`Geometry`](Geometry.md).[`add`](Geometry.md#add)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/geometry/SphereGeometry.ts:64](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/geometry/SphereGeometry.ts#L64)

Declara VBO + IBO.

#### Returns

readonly `GPUDescriptor`[]

#### Overrides

[`Geometry`](Geometry.md).[`getDescriptors`](Geometry.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/geometry/Geometry.ts:40](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/geometry/Geometry.ts#L40)

Pipelines GPU declaradas pelo resource (shader source + entry points
+ consumes). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly `PipelineDescriptor`[]

#### Inherited from

[`Geometry`](Geometry.md).[`getPipelineDescriptors`](Geometry.md#getpipelinedescriptors)

***

### wireDescriptors()

> `protected` **wireDescriptors**(): `GPUDescriptor`[]

Defined in: [elements/geometry/Geometry.ts:61](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/geometry/Geometry.ts#L61)

Descritor das arestas de arame (`data.wireEdges`, índices `uint32` aos pares; spec 008): alocado e deduplicado pela
C2 como os índices. Vazio sem arestas. Subclasses o acrescentam aos seus descritores.

#### Returns

`GPUDescriptor`[]

#### Inherited from

[`Geometry`](Geometry.md).[`wireDescriptors`](Geometry.md#wiredescriptors)

***

### indexArray()

> `protected` `static` **indexArray**(`indices`, `vertexCount`): `Uint16Array`\<`ArrayBufferLike`\> \| `Uint32Array`\<`ArrayBufferLike`\>

Defined in: [elements/geometry/Geometry.ts:81](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/geometry/Geometry.ts#L81)

Array de índices no menor formato que endereça `vertexCount` vértices: `Uint16Array` até 65 535 vértices,
`Uint32Array` acima.

#### Parameters

##### indices

readonly `number`[]

##### vertexCount

`number`

#### Returns

`Uint16Array`\<`ArrayBufferLike`\> \| `Uint32Array`\<`ArrayBufferLike`\>

#### Inherited from

[`Geometry`](Geometry.md).[`indexArray`](Geometry.md#indexarray)
