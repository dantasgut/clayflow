[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ParametricGeometry

# Class: ParametricGeometry

Defined in: [elements/geometry/ParametricGeometry.ts:39](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/geometry/ParametricGeometry.ts#L39)

ParametricGeometry gera uma malha tessellated a partir de uma função
paramétrica `f(u, v) → [x, y, z]`. Útil para superfícies matemáticas
(sphere, torus, möbius, etc.) sem pré-computar mesh data.

Subdivisão é controlada por `uSteps × vSteps` (default 32×32 = 1024 quads).
Normais são placeholder (always [0, 1, 0]) — apps que precisam de
shading correto devem post-processar com derivada cross-product.

## Extends

- [`Geometry`](Geometry.md)\<[`ParametricGeometryData`](../interfaces/ParametricGeometryData.md)\>

## Extended by

- [`ParametricSurfaceGeometry`](ParametricSurfaceGeometry.md)

## Constructors

### Constructor

> **new ParametricGeometry**(`values?`): `ParametricGeometry`

Defined in: [elements/geometry/ParametricGeometry.ts:49](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/geometry/ParametricGeometry.ts#L49)

#### Parameters

##### values?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`ParametricGeometry`

#### Overrides

[`Geometry`](Geometry.md).[`constructor`](Geometry.md#constructor)

## Properties

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/geometry/Geometry.ts:36](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/geometry/Geometry.ts#L36)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`Geometry`](Geometry.md).[`state`](Geometry.md#state)

***

### schema

> `readonly` `static` **schema**: `StructSchema` = `ParametricGeometry.vertexStruct`

Defined in: [elements/geometry/ParametricGeometry.ts:47](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/geometry/ParametricGeometry.ts#L47)

Alias para vertexStruct — Schema interface comum.

***

### vertexStruct

> `readonly` `static` **vertexStruct**: `StructSchema`

Defined in: [elements/geometry/ParametricGeometry.ts:41](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/geometry/ParametricGeometry.ts#L41)

Vertex layout: position (vec3) + normal (vec3) + uv (vec2).

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)\<`object`\>[]

Defined in: [scene/contracts/Entity.ts:138](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/scene/contracts/Entity.ts#L138)

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

Defined in: [elements/geometry/Geometry.ts:49](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/geometry/Geometry.ts#L49)

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

Defined in: [scene/contracts/Entity.ts:90](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/scene/contracts/Entity.ts#L90)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`TData`

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [scene/contracts/Entity.ts:96](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/scene/contracts/Entity.ts#L96)

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

Defined in: [elements/geometry/ParametricGeometry.ts:93](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/geometry/ParametricGeometry.ts#L93)

Número total de índices (= uSteps × vSteps × 6, 2 triangles por quad).

##### Returns

`number`

#### Overrides

[`Geometry`](Geometry.md).[`indexCount`](Geometry.md#indexcount)

***

### indexFormat

#### Get Signature

> **get** **indexFormat**(): `GPUIndexFormat`

Defined in: [elements/geometry/Geometry.ts:82](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/geometry/Geometry.ts#L82)

Formato do index buffer, derivado do array de índices (`Uint32Array` → `'uint32'`).

##### Returns

`GPUIndexFormat`

#### Inherited from

[`Geometry`](Geometry.md).[`indexFormat`](Geometry.md#indexformat)

***

### rawData

#### Get Signature

> **get** `protected` **rawData**(): `Readonly`\<`TData`\>

Defined in: [scene/contracts/Entity.ts:110](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/scene/contracts/Entity.ts#L110)

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

Defined in: [elements/geometry/ParametricGeometry.ts:89](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/geometry/ParametricGeometry.ts#L89)

Número total de vértices (= (uSteps+1) × (vSteps+1)).

##### Returns

`number`

#### Overrides

[`Geometry`](Geometry.md).[`vertexCount`](Geometry.md#vertexcount)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:118](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/scene/contracts/Entity.ts#L118)

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

Defined in: [scene/contracts/Entity.ts:127](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/scene/contracts/Entity.ts#L127)

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

Defined in: [elements/geometry/ParametricGeometry.ts:75](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/geometry/ParametricGeometry.ts#L75)

Declara VBO (vertex buffer) + IBO (index buffer) para o ResourceSystem.

#### Returns

readonly `GPUDescriptor`[]

#### Overrides

[`Geometry`](Geometry.md).[`getDescriptors`](Geometry.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/geometry/Geometry.ts:40](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/geometry/Geometry.ts#L40)

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

Defined in: [elements/geometry/Geometry.ts:61](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/geometry/Geometry.ts#L61)

Descritor das arestas de arame (`data.wireEdges`, índices `uint32` aos pares; spec 008): alocado e deduplicado pela
C2 como os índices. Vazio sem arestas. Subclasses o acrescentam aos seus descritores.

#### Returns

`GPUDescriptor`[]

#### Inherited from

[`Geometry`](Geometry.md).[`wireDescriptors`](Geometry.md#wiredescriptors)

***

### indexArray()

> `protected` `static` **indexArray**(`indices`, `vertexCount`): `Uint16Array`\<`ArrayBufferLike`\> \| `Uint32Array`\<`ArrayBufferLike`\>

Defined in: [elements/geometry/Geometry.ts:90](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/geometry/Geometry.ts#L90)

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
