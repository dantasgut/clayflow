[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / SurfaceGeometry

# Class: SurfaceGeometry

Defined in: [src/elements/geometry/SurfaceGeometry.ts:32](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/SurfaceGeometry.ts#L32)

Superfície de malha escrita pela GPU (spec 008, R5): os vértices de um corpo mole, um por partícula, recalculados a
cada quadro por um estágio (posição da faixa do corpo no pool, normal média dos triângulos adjacentes) e desenhados
pelo forward e pela sombra como qualquer geometria. A CPU envia só o estado inicial (`upload: 'initial'`: uvs e
posições do momento da inserção) e os triângulos; quem escreve os vértices declara a posse (`owns`).

Fica fora da deduplicação por conteúdo: cada superfície é própria do seu corpo.

## Extends

- [`Geometry`](Geometry.md)\<[`SurfaceGeometryData`](../interfaces/SurfaceGeometryData.md)\>

## Constructors

### Constructor

> **new SurfaceGeometry**(`positions`, `triangles`, `uvs?`): `SurfaceGeometry`

Defined in: [src/elements/geometry/SurfaceGeometry.ts:50](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/SurfaceGeometry.ts#L50)

#### Parameters

##### positions

`ArrayLike`\<`number`\>

Posições iniciais (`x, y, z` por vértice).

##### triangles

`ArrayLike`\<`number`\>

Triângulos (3 índices locais por triângulo, sentido anti-horário visto de fora).

##### uvs?

`ArrayLike`\<`number`\>

Coordenadas de textura (`u, v` por vértice). Default zero.

#### Returns

`SurfaceGeometry`

#### Throws

RangeError se um índice está fora dos vértices ou os tamanhos não batem.

#### Overrides

[`Geometry`](Geometry.md).[`constructor`](Geometry.md#constructor)

## Properties

### state

> **state**: [`ResourceState`](../../platform/web/enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [src/elements/geometry/Geometry.ts:36](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/Geometry.ts#L36)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`Geometry`](Geometry.md).[`state`](Geometry.md#state)

***

### adjacencySchema

> `readonly` `static` **adjacencySchema**: [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/elements/geometry/SurfaceGeometry.ts:40](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/SurfaceGeometry.ts#L40)

Elemento da adjacência (`u32`).

***

### vertexStruct

> `readonly` `static` **vertexStruct**: [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/elements/geometry/SurfaceGeometry.ts:34](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/SurfaceGeometry.ts#L34)

Layout do vértice (o do forward: posição, normal, uv; 32 bytes).

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

[`Geometry`](Geometry.md).[`attached`](Geometry.md#attached)

***

### contentKey

#### Get Signature

> **get** **contentKey**(): `string` \| `undefined`

Defined in: [src/elements/geometry/SurfaceGeometry.ts:120](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/SurfaceGeometry.ts#L120)

Própria do corpo: fora da deduplicação por conteúdo.

##### Returns

`string` \| `undefined`

Chave de conteúdo dos descritores `vertex`/`index` (spec 007). Resources com a mesma chave compartilham esses
buffers na GPU: a Camada 2 cria e escreve o buffer uma vez por chave e o libera quando o último usuário sai. Sem
chave, cada Resource tem os seus.

#### Overrides

[`Geometry`](Geometry.md).[`contentKey`](Geometry.md#contentkey)

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

#### Inherited from

[`Geometry`](Geometry.md).[`data`](Geometry.md#data)

***

### indexCount

#### Get Signature

> **get** **indexCount**(): `number`

Defined in: [src/elements/geometry/SurfaceGeometry.ts:115](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/SurfaceGeometry.ts#L115)

Número de índices (0 = sem index buffer, draw não-indexed).

##### Returns

`number`

#### Overrides

[`Geometry`](Geometry.md).[`indexCount`](Geometry.md#indexcount)

***

### indexFormat

#### Get Signature

> **get** **indexFormat**(): `GPUIndexFormat`

Defined in: [src/elements/geometry/Geometry.ts:101](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/Geometry.ts#L101)

Formato do index buffer, derivado do array de índices (`Uint32Array` → `'uint32'`).

##### Returns

`GPUIndexFormat`

#### Inherited from

[`Geometry`](Geometry.md).[`indexFormat`](Geometry.md#indexformat)

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

[`Geometry`](Geometry.md).[`rawData`](Geometry.md#rawdata)

***

### triangleCount

#### Get Signature

> **get** **triangleCount**(): `number`

Defined in: [src/elements/geometry/SurfaceGeometry.ts:107](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/SurfaceGeometry.ts#L107)

Número de triângulos.

##### Returns

`number`

***

### vertexCount

#### Get Signature

> **get** **vertexCount**(): `number`

Defined in: [src/elements/geometry/SurfaceGeometry.ts:111](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/SurfaceGeometry.ts#L111)

Número de vértices na geometria — usado para `pass.draw(count)`.

##### Returns

`number`

#### Overrides

[`Geometry`](Geometry.md).[`vertexCount`](Geometry.md#vertexcount)

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

[`Geometry`](Geometry.md).[`add`](Geometry.md#add)

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

[`Geometry`](Geometry.md).[`detach`](Geometry.md#detach)

***

### getDescriptors()

> **getDescriptors**(): readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

Defined in: [src/elements/geometry/SurfaceGeometry.ts:125](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/SurfaceGeometry.ts#L125)

Vértices (estado inicial; depois escritos pela GPU), triângulos e adjacência.

#### Returns

readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

#### Overrides

[`Geometry`](Geometry.md).[`getDescriptors`](Geometry.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

Defined in: [src/elements/geometry/Geometry.ts:40](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/Geometry.ts#L40)

Pipelines GPU declaradas pelo resource (shader e entry points; recursos
pelos módulos declarados). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

#### Inherited from

[`Geometry`](Geometry.md).[`getPipelineDescriptors`](Geometry.md#getpipelinedescriptors)

***

### historyDescriptors()

> `protected` **historyDescriptors**(`vertices`): [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

Defined in: [src/elements/geometry/Geometry.ts:82](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/Geometry.ts#L82)

Descritor dos vértices do quadro anterior (`previousVertices`, spec 034): o mesmo layout de `vertices`, para
geometria cujos vértices a GPU reescreve (superfícies, corpos moles, grafos). O histórico de movimento guarda neles
os vértices antes de o produtor os reescrever; o passe de movimento compara os dois (vetores de movimento da
geometria deformada). Alocado só quando há escritor dos vértices na GPU.

#### Parameters

##### vertices

[`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)

#### Returns

[`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

#### Inherited from

[`Geometry`](Geometry.md).[`historyDescriptors`](Geometry.md#historydescriptors)

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

[`SurfaceGeometryData`](../interfaces/SurfaceGeometryData.md)

#### Returns

`void`

#### Inherited from

[`Geometry`](Geometry.md).[`redescribe`](Geometry.md#redescribe)

***

### wireDescriptors()

> `protected` **wireDescriptors**(): [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

Defined in: [src/elements/geometry/Geometry.ts:61](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/Geometry.ts#L61)

Descritor das arestas de arame (`data.wireEdges`, índices `uint32` aos pares; spec 008): alocado e deduplicado pela
C2 como os índices. Vazio sem arestas. Subclasses o acrescentam aos seus descritores.

#### Returns

[`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

#### Inherited from

[`Geometry`](Geometry.md).[`wireDescriptors`](Geometry.md#wiredescriptors)

***

### indexArray()

> `protected` `static` **indexArray**(`indices`, `vertexCount`): `Uint32Array`\<`ArrayBufferLike`\> \| `Uint16Array`\<`ArrayBufferLike`\>

Defined in: [src/elements/geometry/Geometry.ts:109](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/Geometry.ts#L109)

Array de índices no menor formato que endereça `vertexCount` vértices: `Uint16Array` até 65 535 vértices,
`Uint32Array` acima.

#### Parameters

##### indices

readonly `number`[]

##### vertexCount

`number`

#### Returns

`Uint32Array`\<`ArrayBufferLike`\> \| `Uint16Array`\<`ArrayBufferLike`\>

#### Inherited from

[`Geometry`](Geometry.md).[`indexArray`](Geometry.md#indexarray)
