[**webgpu-engine**](../README.md)

***

[webgpu-engine](../README.md) / BoxGeometry

# Class: BoxGeometry

Defined in: [elements/geometry/BoxGeometry.ts:8](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/elements/geometry/BoxGeometry.ts#L8)

Primitiva amigável geradora de Cubos. (Camada 3)
O desenvolvedor instancia na CPU e ela preenche suas propriedades `rawVertices`.

## Extends

- [`Geometry`](Geometry.md)

## Constructors

### Constructor

> **new BoxGeometry**(`width?`, `height?`, `depth?`): `BoxGeometry`

Defined in: [elements/geometry/BoxGeometry.ts:13](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/elements/geometry/BoxGeometry.ts#L13)

#### Parameters

##### width?

`number` = `1`

##### height?

`number` = `1`

##### depth?

`number` = `1`

#### Returns

`BoxGeometry`

#### Overrides

[`Geometry`](Geometry.md).[`constructor`](Geometry.md#constructor)

## Properties

### indexBufferId?

> `optional` **indexBufferId?**: `string`

Defined in: [scene/components/Geometry.ts:20](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L20)

#### Inherited from

[`Geometry`](Geometry.md).[`indexBufferId`](Geometry.md#indexbufferid)

***

### instanceCount

> **instanceCount**: `number` = `1`

Defined in: [scene/components/Geometry.ts:22](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L22)

#### Inherited from

[`Geometry`](Geometry.md).[`instanceCount`](Geometry.md#instancecount)

***

### layer

> `readonly` **layer**: [`VISUAL_COMPONENT`](../enumerations/ResourceType.md#visual_component) = `ResourceType.VISUAL_COMPONENT`

Defined in: [scene/components/Geometry.ts:15](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L15)

#### Inherited from

[`Geometry`](Geometry.md).[`layer`](Geometry.md#layer)

***

### layout

> **layout**: [`VertexLayout`](VertexLayout.md)

Defined in: [scene/components/Geometry.ts:23](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L23)

#### Inherited from

[`Geometry`](Geometry.md).[`layout`](Geometry.md#layout)

***

### rawIndices

> **rawIndices**: `Uint16Array`\<`ArrayBufferLike`\> \| `Uint32Array`\<`ArrayBufferLike`\> \| `null` = `null`

Defined in: [scene/components/Geometry.ts:26](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L26)

#### Inherited from

[`Geometry`](Geometry.md).[`rawIndices`](Geometry.md#rawindices)

***

### rawVertices

> **rawVertices**: `Float32Array`\<`ArrayBufferLike`\> \| `null` = `null`

Defined in: [scene/components/Geometry.ts:25](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L25)

#### Inherited from

[`Geometry`](Geometry.md).[`rawVertices`](Geometry.md#rawvertices)

***

### rawWireframeEdges

> **rawWireframeEdges**: `Uint32Array`\<`ArrayBufferLike`\> \| `null` = `null`

Defined in: [scene/components/Geometry.ts:40](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L40)

Lista explícita de arestas para wireframe (2 u32 por aresta: índices em rawWireframePositions).
Definida pelo autor da geometria — contém apenas as arestas reais da malha,
sem diagonais de triangulação.

#### Inherited from

[`Geometry`](Geometry.md).[`rawWireframeEdges`](Geometry.md#rawwireframeedges)

***

### rawWireframePositions

> **rawWireframePositions**: `Float32Array`\<`ArrayBufferLike`\> \| `null` = `null`

Defined in: [scene/components/Geometry.ts:33](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L33)

Lista explícita de posições de vértice para wireframe (3 floats por vértice).
Separada do VBO principal para ser independente de stride/normal/uv.
Definida pelo autor da geometria — nunca derivada da triangulação.

#### Inherited from

[`Geometry`](Geometry.md).[`rawWireframePositions`](Geometry.md#rawwireframepositions)

***

### state

> **state**: [`ResourceState`](../enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [scene/components/Geometry.ts:18](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L18)

#### Inherited from

[`Geometry`](Geometry.md).[`state`](Geometry.md#state)

***

### type

> `readonly` **type**: `string` = `'Geometry'`

Defined in: [scene/components/Geometry.ts:16](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L16)

#### Inherited from

[`Geometry`](Geometry.md).[`type`](Geometry.md#type)

***

### uuid

> `readonly` **uuid**: `string`

Defined in: [scene/components/Geometry.ts:13](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L13)

#### Inherited from

[`Geometry`](Geometry.md).[`uuid`](Geometry.md#uuid)

***

### vertexBufferId

> **vertexBufferId**: `string` = `''`

Defined in: [scene/components/Geometry.ts:19](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L19)

#### Inherited from

[`Geometry`](Geometry.md).[`vertexBufferId`](Geometry.md#vertexbufferid)

***

### vertexCount

> **vertexCount**: `number` = `0`

Defined in: [scene/components/Geometry.ts:21](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L21)

#### Inherited from

[`Geometry`](Geometry.md).[`vertexCount`](Geometry.md#vertexcount)

***

### wireframeEdgeCount

> **wireframeEdgeCount**: `number` = `0`

Defined in: [scene/components/Geometry.ts:47](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L47)

Número de arestas wireframe (rawWireframeEdges.length / 2).

#### Inherited from

[`Geometry`](Geometry.md).[`wireframeEdgeCount`](Geometry.md#wireframeedgecount)

***

### wireframeEdgesBufferId?

> `optional` **wireframeEdgesBufferId?**: `string`

Defined in: [scene/components/Geometry.ts:45](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L45)

ID do storage buffer de arestas de wireframe.

#### Inherited from

[`Geometry`](Geometry.md).[`wireframeEdgesBufferId`](Geometry.md#wireframeedgesbufferid)

***

### wireframePositionsBufferId?

> `optional` **wireframePositionsBufferId?**: `string`

Defined in: [scene/components/Geometry.ts:43](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L43)

ID do storage buffer de posições de wireframe.

#### Inherited from

[`Geometry`](Geometry.md).[`wireframePositionsBufferId`](Geometry.md#wireframepositionsbufferid)

## Methods

### allocateResource()

> **allocateResource**(`resourceManager`): `Promise`\<`void`\>

Defined in: [scene/components/Geometry.ts:55](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L55)

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

Defined in: [scene/components/Geometry.ts:110](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L110)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`void`

#### Inherited from

[`Geometry`](Geometry.md).[`disposeResource`](Geometry.md#disposeresource)

***

### markDirty()

> **markDirty**(): `void`

Defined in: [scene/components/Geometry.ts:49](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L49)

#### Returns

`void`

#### Inherited from

[`Geometry`](Geometry.md).[`markDirty`](Geometry.md#markdirty)

***

### updateResource()

> **updateResource**(`resourceManager`): `Promise`\<`void`\>

Defined in: [scene/components/Geometry.ts:93](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L93)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`Geometry`](Geometry.md).[`updateResource`](Geometry.md#updateresource)
