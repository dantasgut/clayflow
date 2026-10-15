[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / PointCloudGeometry

# Class: PointCloudGeometry

Defined in: [elements/geometry/PointCloudGeometry.ts:29](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/PointCloudGeometry.ts#L29)

Nuvem de pontos escrita pela GPU (spec 008, R6): um vertex buffer de `maxPoints` vértices (posição, normal, uv; o
layout do forward) que **só a GPU escreve** (`upload: 'never'`) — por um estágio que declara a posse dele
(`slot.entities({ owns: [[PointCloudGeometry, 'vertices']] })`). Com `PointSpriteMaterial` cada ponto vira um sprite;
com material de triângulos ou linhas, os vértices são desenhados sem índices. Desenha os `activeCount` primeiros
(mutável: o desenho segue o valor do quadro). Própria da entidade (fora da deduplicação).

## Extends

- [`Geometry`](Geometry.md)\<[`PointCloudGeometryData`](../interfaces/PointCloudGeometryData.md)\>

## Constructors

### Constructor

> **new PointCloudGeometry**(`values?`): `PointCloudGeometry`

Defined in: [elements/geometry/PointCloudGeometry.ts:38](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/PointCloudGeometry.ts#L38)

#### Parameters

##### values?

[`PointCloudGeometryValues`](../interfaces/PointCloudGeometryValues.md) = `{}`

#### Returns

`PointCloudGeometry`

#### Throws

RangeError com capacidade não positiva ou `activeCount` fora de `[0, maxPoints]`.

#### Overrides

[`Geometry`](Geometry.md).[`constructor`](Geometry.md#constructor)

## Properties

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/geometry/Geometry.ts:36](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/Geometry.ts#L36)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`Geometry`](Geometry.md).[`state`](Geometry.md#state)

***

### vertexStruct

> `readonly` `static` **vertexStruct**: `StructSchema`

Defined in: [elements/geometry/PointCloudGeometry.ts:31](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/PointCloudGeometry.ts#L31)

Layout do ponto (o do forward: posição, normal, uv; 32 bytes).

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)\<`object`\>[]

Defined in: [scene/contracts/Entity.ts:138](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/Entity.ts#L138)

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

Defined in: [elements/geometry/PointCloudGeometry.ts:79](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/PointCloudGeometry.ts#L79)

Própria da entidade: fora da deduplicação por conteúdo.

##### Returns

`string` \| `undefined`

#### Overrides

[`Geometry`](Geometry.md).[`contentKey`](Geometry.md#contentkey)

***

### data

#### Get Signature

> **get** **data**(): `TData`

Defined in: [scene/contracts/Entity.ts:90](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/Entity.ts#L90)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`TData`

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [scene/contracts/Entity.ts:96](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/Entity.ts#L96)

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

Defined in: [elements/geometry/PointCloudGeometry.ts:74](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/PointCloudGeometry.ts#L74)

Sem índices.

##### Returns

`number`

#### Overrides

[`Geometry`](Geometry.md).[`indexCount`](Geometry.md#indexcount)

***

### indexFormat

#### Get Signature

> **get** **indexFormat**(): `GPUIndexFormat`

Defined in: [elements/geometry/Geometry.ts:82](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/Geometry.ts#L82)

Formato do index buffer, derivado do array de índices (`Uint32Array` → `'uint32'`).

##### Returns

`GPUIndexFormat`

#### Inherited from

[`Geometry`](Geometry.md).[`indexFormat`](Geometry.md#indexformat)

***

### rawData

#### Get Signature

> **get** `protected` **rawData**(): `Readonly`\<`TData`\>

Defined in: [scene/contracts/Entity.ts:110](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/Entity.ts#L110)

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

Defined in: [elements/geometry/PointCloudGeometry.ts:69](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/PointCloudGeometry.ts#L69)

Pontos desenhados (`activeCount`).

##### Returns

`number`

#### Overrides

[`Geometry`](Geometry.md).[`vertexCount`](Geometry.md#vertexcount)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:118](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/Entity.ts#L118)

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

### detach()

> **detach**(`e`): `boolean`

Defined in: [scene/contracts/Entity.ts:127](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/Entity.ts#L127)

Desanexa uma Entity-filha direta (inverso de `add`). Devolve `false` se ela não é filha desta. Numa entidade já
inserida, use `World.detach` (que também atualiza a cena).

#### Parameters

##### e

[`Entity`](Entity.md)\<`object`\>

#### Returns

`boolean`

#### Inherited from

[`Geometry`](Geometry.md).[`detach`](Geometry.md#detach)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/geometry/PointCloudGeometry.ts:56](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/PointCloudGeometry.ts#L56)

Vértices escritos só pela GPU.

#### Returns

readonly `GPUDescriptor`[]

#### Overrides

[`Geometry`](Geometry.md).[`getDescriptors`](Geometry.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/geometry/Geometry.ts:40](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/Geometry.ts#L40)

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

Defined in: [elements/geometry/Geometry.ts:61](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/Geometry.ts#L61)

Descritor das arestas de arame (`data.wireEdges`, índices `uint32` aos pares; spec 008): alocado e deduplicado pela
C2 como os índices. Vazio sem arestas. Subclasses o acrescentam aos seus descritores.

#### Returns

`GPUDescriptor`[]

#### Inherited from

[`Geometry`](Geometry.md).[`wireDescriptors`](Geometry.md#wiredescriptors)

***

### indexArray()

> `protected` `static` **indexArray**(`indices`, `vertexCount`): `Uint16Array`\<`ArrayBufferLike`\> \| `Uint32Array`\<`ArrayBufferLike`\>

Defined in: [elements/geometry/Geometry.ts:90](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/Geometry.ts#L90)

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
