# Class: PointCloudGeometry

Defined in: [elements/geometry/PointCloudGeometry.ts:15](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/geometry/PointCloudGeometry.ts#L15)

Geometria de nuvem de pontos — N vértices sem índices.

Cada vértice representa uma partícula. As posições são escritas em runtime
por um compute shader (ex: `mpm_vertex_write`) via `vertexBufferId`.

Stride: 8 floats (pos.xyz + normal.xyz + uv.xy) — compatível com
`MPM_VERTEX_STRIDE = 8` no kernel mpm_vertex_write.wgsl.

Para renderização visível use um material com `topology = 'point-list'`.

## Extends

- [`Geometry`](Geometry.md)

## Constructors

### Constructor

> **new PointCloudGeometry**(`count`): `PointCloudGeometry`

Defined in: [elements/geometry/PointCloudGeometry.ts:16](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/geometry/PointCloudGeometry.ts#L16)

#### Parameters

##### count

`number`

#### Returns

`PointCloudGeometry`

#### Overrides

[`Geometry`](Geometry.md).[`constructor`](Geometry.md#constructor)

## Properties

### indexBufferId?

> `optional` **indexBufferId?**: `string`

Defined in: [scene/components/Geometry.ts:27](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/Geometry.ts#L27)

#### Inherited from

[`Geometry`](Geometry.md).[`indexBufferId`](Geometry.md#indexbufferid)

***

### instanceCount

> **instanceCount**: `number` = `1`

Defined in: [scene/components/Geometry.ts:29](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/Geometry.ts#L29)

#### Inherited from

[`Geometry`](Geometry.md).[`instanceCount`](Geometry.md#instancecount)

***

### layer

> `readonly` **layer**: [`VISUAL_COMPONENT`](../enumerations/ResourceType.md#visual_component) = `ResourceType.VISUAL_COMPONENT`

Defined in: [scene/components/Geometry.ts:17](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/Geometry.ts#L17)

#### Inherited from

[`Geometry`](Geometry.md).[`layer`](Geometry.md#layer)

***

### layout

> **layout**: [`VertexLayout`](VertexLayout.md)

Defined in: [scene/components/Geometry.ts:30](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/Geometry.ts#L30)

#### Inherited from

[`Geometry`](Geometry.md).[`layout`](Geometry.md#layout)

***

### rawIndices

> **rawIndices**: `Uint16Array` \| `Uint32Array` \| `null` = `null`

Defined in: [scene/components/Geometry.ts:33](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/Geometry.ts#L33)

#### Inherited from

[`Geometry`](Geometry.md).[`rawIndices`](Geometry.md#rawindices)

***

### rawVertices

> **rawVertices**: `Float32Array` \| `null` = `null`

Defined in: [scene/components/Geometry.ts:32](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/Geometry.ts#L32)

#### Inherited from

[`Geometry`](Geometry.md).[`rawVertices`](Geometry.md#rawvertices)

***

### rawWireframeEdges

> **rawWireframeEdges**: `Uint32Array` \| `null` = `null`

Defined in: [scene/components/Geometry.ts:47](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/Geometry.ts#L47)

Lista explícita de arestas para wireframe (2 u32 por aresta: índices em rawWireframePositions).
Definida pelo autor da geometria — contém apenas as arestas reais da malha,
sem diagonais de triangulação.

#### Inherited from

[`Geometry`](Geometry.md).[`rawWireframeEdges`](Geometry.md#rawwireframeedges)

***

### rawWireframePositions

> **rawWireframePositions**: `Float32Array` \| `null` = `null`

Defined in: [scene/components/Geometry.ts:40](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/Geometry.ts#L40)

Lista explícita de posições de vértice para wireframe (3 floats por vértice).
Separada do VBO principal para ser independente de stride/normal/uv.
Definida pelo autor da geometria — nunca derivada da triangulação.

#### Inherited from

[`Geometry`](Geometry.md).[`rawWireframePositions`](Geometry.md#rawwireframepositions)

***

### state

> **state**: [`ResourceState`](../enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [scene/components/Geometry.ts:20](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/Geometry.ts#L20)

#### Inherited from

[`Geometry`](Geometry.md).[`state`](Geometry.md#state)

***

### type

> `readonly` **type**: `string` = `'Geometry'`

Defined in: [scene/components/Geometry.ts:18](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/Geometry.ts#L18)

#### Inherited from

[`Geometry`](Geometry.md).[`type`](Geometry.md#type)

***

### uuid

> `readonly` **uuid**: `string`

Defined in: [scene/components/Geometry.ts:15](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/Geometry.ts#L15)

#### Inherited from

[`Geometry`](Geometry.md).[`uuid`](Geometry.md#uuid)

***

### vertexBufferId

> **vertexBufferId**: `string` = `''`

Defined in: [scene/components/Geometry.ts:26](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/Geometry.ts#L26)

#### Inherited from

[`Geometry`](Geometry.md).[`vertexBufferId`](Geometry.md#vertexbufferid)

***

### vertexCount

> **vertexCount**: `number` = `0`

Defined in: [scene/components/Geometry.ts:28](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/Geometry.ts#L28)

#### Inherited from

[`Geometry`](Geometry.md).[`vertexCount`](Geometry.md#vertexcount)

***

### wireframeEdgeCount

> **wireframeEdgeCount**: `number` = `0`

Defined in: [scene/components/Geometry.ts:54](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/Geometry.ts#L54)

Número de arestas wireframe (rawWireframeEdges.length / 2).

#### Inherited from

[`Geometry`](Geometry.md).[`wireframeEdgeCount`](Geometry.md#wireframeedgecount)

***

### wireframeEdgesBufferId?

> `optional` **wireframeEdgesBufferId?**: `string`

Defined in: [scene/components/Geometry.ts:52](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/Geometry.ts#L52)

ID do storage buffer de arestas de wireframe.

#### Inherited from

[`Geometry`](Geometry.md).[`wireframeEdgesBufferId`](Geometry.md#wireframeedgesbufferid)

***

### wireframePositionsBufferId?

> `optional` **wireframePositionsBufferId?**: `string`

Defined in: [scene/components/Geometry.ts:50](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/Geometry.ts#L50)

ID do storage buffer de posições de wireframe.

#### Inherited from

[`Geometry`](Geometry.md).[`wireframePositionsBufferId`](Geometry.md#wireframepositionsbufferid)

## Accessors

### currentResourceState

#### Get Signature

> **get** **currentResourceState**(): `ResourceStateHandler`

Defined in: [scene/components/Geometry.ts:23](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/Geometry.ts#L23)

Handler do estado atual — encapsula capacidades do ciclo de vida GPU.

##### Returns

`ResourceStateHandler`

Handler do estado atual — consulta de capacidades pelos consumidores.

#### Inherited from

[`Geometry`](Geometry.md).[`currentResourceState`](Geometry.md#currentresourcestate)

***

### isGpuManaged

#### Get Signature

> **get** **isGpuManaged**(): `boolean`

Defined in: [scene/components/Geometry.ts:69](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/Geometry.ts#L69)

Retorna true quando o compute shader é o escritor ativo do vertex buffer.
Enquanto true, markDirty() é no-op e o ResourceLoader suprime uploads.

##### Returns

`boolean`

#### Inherited from

[`Geometry`](Geometry.md).[`isGpuManaged`](Geometry.md#isgpumanaged)

## Methods

### allocateResource()

> **allocateResource**(`resourceManager`): `Promise`\<`void`\>

Defined in: [scene/components/Geometry.ts:97](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/Geometry.ts#L97)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`Geometry`](Geometry.md).[`allocateResource`](Geometry.md#allocateresource)

***

### disposeResource()

> **disposeResource**(`resourceManager`): `void`

Defined in: [scene/components/Geometry.ts:152](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/Geometry.ts#L152)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`void`

#### Inherited from

[`Geometry`](Geometry.md).[`disposeResource`](Geometry.md#disposeresource)

***

### enterGpuManagedMode()

> **enterGpuManagedMode**(): `void`

Defined in: [scene/components/Geometry.ts:78](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/Geometry.ts#L78)

Transfere a propriedade do vertex buffer para o pipeline GPU.
Pré-condição: state === Ready (geometry já alocada na VRAM).
Após a chamada, markDirty() é ignorado até exitGpuManagedMode().

#### Returns

`void`

#### Inherited from

[`Geometry`](Geometry.md).[`enterGpuManagedMode`](Geometry.md#entergpumanagedmode)

***

### exitGpuManagedMode()

> **exitGpuManagedMode**(): `void`

Defined in: [scene/components/Geometry.ts:87](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/Geometry.ts#L87)

Devolve a propriedade do vertex buffer ao pipeline CPU.
Transiciona para Dirty, forçando re-upload de rawVertices no próximo frame.

#### Returns

`void`

#### Inherited from

[`Geometry`](Geometry.md).[`exitGpuManagedMode`](Geometry.md#exitgpumanagedmode)

***

### markDirty()

> **markDirty**(): `void`

Defined in: [scene/components/Geometry.ts:92](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/Geometry.ts#L92)

#### Returns

`void`

#### Inherited from

[`Geometry`](Geometry.md).[`markDirty`](Geometry.md#markdirty)

***

### updateResource()

> **updateResource**(`resourceManager`): `Promise`\<`void`\>

Defined in: [scene/components/Geometry.ts:135](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/Geometry.ts#L135)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`Geometry`](Geometry.md).[`updateResource`](Geometry.md#updateresource)
