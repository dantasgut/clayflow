[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ParametricSurface

# Class: ParametricSurface

Defined in: [elements/geometry/ParametricSurface.ts:130](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L130)

Superfície paramétrica avaliada na GPU (spec 009): uma grade u × v cujos vértices (posição, normal, uv) o
`SurfaceFlow` escreve a partir da função `surface` da entidade (`SurfaceFunction`) ou da superfície pronta
(`preset`), com o espaço da cena aplicado (`SpaceFunction`). Índices fixos da grade (dois triângulos por célula, face
da frente para o lado de du × dv). Desenhada pelo forward e pela sombra como qualquer geometria. Mudar a resolução
cria outra geometria (os índices são da construção); domínio, pronta e parâmetros podem mudar em execução. Com
`differential` (spec 010), cada vértice tem também a geometria diferencial no pool `SurfaceDiff`.

## Extends

- [`Geometry`](Geometry.md)\<[`ParametricSurfaceData`](../interfaces/ParametricSurfaceData.md)\>

## Constructors

### Constructor

> **new ParametricSurface**(`options?`): `ParametricSurface`

Defined in: [elements/geometry/ParametricSurface.ts:139](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L139)

#### Parameters

##### options?

[`ParametricSurfaceOptions`](../interfaces/ParametricSurfaceOptions.md) = `{}`

#### Returns

`ParametricSurface`

#### Overrides

[`Geometry`](Geometry.md).[`constructor`](Geometry.md#constructor)

## Properties

### adaptive

> `readonly` **adaptive**: [`AdaptiveConfig`](../interfaces/AdaptiveConfig.md) \| `undefined`

Defined in: [elements/geometry/ParametricSurface.ts:137](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L137)

Malha adaptativa (valores efetivos), ou `undefined` na uniforme.

***

### differential

> `readonly` **differential**: `boolean`

Defined in: [elements/geometry/ParametricSurface.ts:135](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L135)

Tem geometria diferencial por vértice (pool `SurfaceDiff`).

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/geometry/Geometry.ts:36](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/Geometry.ts#L36)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`Geometry`](Geometry.md).[`state`](Geometry.md#state)

***

### vertexStruct

> `readonly` `static` **vertexStruct**: `StructSchema` = `SurfaceGeometry.vertexStruct`

Defined in: [elements/geometry/ParametricSurface.ts:132](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L132)

Vértice (posição, normal, uv) — o mesmo das superfícies dos corpos moles.

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

Defined in: [elements/geometry/ParametricSurface.ts:287](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L287)

Vértices escritos na GPU, próprios de cada superfície: sem deduplicação por conteúdo.

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

Defined in: [elements/geometry/ParametricSurface.ts:277](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L277)

Número de índices (0 = sem index buffer, draw não-indexed).

##### Returns

`number`

#### Overrides

[`Geometry`](Geometry.md).[`indexCount`](Geometry.md#indexcount)

***

### indexFormat

#### Get Signature

> **get** **indexFormat**(): `GPUIndexFormat`

Defined in: [elements/geometry/ParametricSurface.ts:282](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L282)

Índices de 32 bits (a grade uniforme e a adaptativa).

##### Returns

`GPUIndexFormat`

#### Overrides

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

Defined in: [elements/geometry/ParametricSurface.ts:273](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L273)

Número de vértices na geometria — usado para `pass.draw(count)`.

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

Defined in: [elements/geometry/ParametricSurface.ts:203](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/geometry/ParametricSurface.ts#L203)

Lista de bindings GPU (uniform/storage buffers, texturas, samplers)
que este resource expõe ao `ResourceSystem`. Cada descriptor define
`id`, `role`, `schema` (StructSchema) e opcionalmente `storage`
(`'pool'` para coalescer N members do mesmo schema em 1 buffer).

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
