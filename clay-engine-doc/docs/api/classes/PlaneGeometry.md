# Class: PlaneGeometry

Defined in: [elements/geometry/PlaneGeometry.ts:8](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/geometry/PlaneGeometry.ts#L8)

Plano no eixo XZ gerado parametricamente. (Camada 3)

Normal aponta para +Y. u → X, v → Z.

## Extends

- [`ParametricGeometry`](ParametricGeometry.md)

## Constructors

### Constructor

> **new PlaneGeometry**(`width?`, `depth?`, `widthSegs?`, `depthSegs?`): `PlaneGeometry`

Defined in: [elements/geometry/PlaneGeometry.ts:9](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/geometry/PlaneGeometry.ts#L9)

#### Parameters

##### width?

`number` = `1`

##### depth?

`number` = `1`

##### widthSegs?

`number` = `1`

##### depthSegs?

`number` = `1`

#### Returns

`PlaneGeometry`

#### Overrides

[`ParametricGeometry`](ParametricGeometry.md).[`constructor`](ParametricGeometry.md#constructor)

## Properties

### indexBufferId?

> `optional` **indexBufferId?**: `string`

Defined in: [scene/components/Geometry.ts:20](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Geometry.ts#L20)

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`indexBufferId`](ParametricGeometry.md#indexbufferid)

***

### instanceCount

> **instanceCount**: `number` = `1`

Defined in: [scene/components/Geometry.ts:22](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Geometry.ts#L22)

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`instanceCount`](ParametricGeometry.md#instancecount)

***

### layer

> `readonly` **layer**: [`VISUAL_COMPONENT`](../enumerations/ResourceType.md#visual_component) = `ResourceType.VISUAL_COMPONENT`

Defined in: [scene/components/Geometry.ts:15](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Geometry.ts#L15)

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`layer`](ParametricGeometry.md#layer)

***

### layout

> **layout**: [`VertexLayout`](VertexLayout.md)

Defined in: [scene/components/Geometry.ts:23](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Geometry.ts#L23)

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`layout`](ParametricGeometry.md#layout)

***

### rawIndices

> **rawIndices**: `Uint16Array` \| `Uint32Array` \| `null` = `null`

Defined in: [scene/components/Geometry.ts:26](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Geometry.ts#L26)

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`rawIndices`](ParametricGeometry.md#rawindices)

***

### rawVertices

> **rawVertices**: `Float32Array` \| `null` = `null`

Defined in: [scene/components/Geometry.ts:25](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Geometry.ts#L25)

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`rawVertices`](ParametricGeometry.md#rawvertices)

***

### rawWireframeEdges

> **rawWireframeEdges**: `Uint32Array` \| `null` = `null`

Defined in: [scene/components/Geometry.ts:40](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Geometry.ts#L40)

Lista explícita de arestas para wireframe (2 u32 por aresta: índices em rawWireframePositions).
Definida pelo autor da geometria — contém apenas as arestas reais da malha,
sem diagonais de triangulação.

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`rawWireframeEdges`](ParametricGeometry.md#rawwireframeedges)

***

### rawWireframePositions

> **rawWireframePositions**: `Float32Array` \| `null` = `null`

Defined in: [scene/components/Geometry.ts:33](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Geometry.ts#L33)

Lista explícita de posições de vértice para wireframe (3 floats por vértice).
Separada do VBO principal para ser independente de stride/normal/uv.
Definida pelo autor da geometria — nunca derivada da triangulação.

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`rawWireframePositions`](ParametricGeometry.md#rawwireframepositions)

***

### state

> **state**: [`ResourceState`](../enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [scene/components/Geometry.ts:18](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Geometry.ts#L18)

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`state`](ParametricGeometry.md#state)

***

### type

> `readonly` **type**: `string` = `'Geometry'`

Defined in: [scene/components/Geometry.ts:16](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Geometry.ts#L16)

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`type`](ParametricGeometry.md#type)

***

### uuid

> `readonly` **uuid**: `string`

Defined in: [scene/components/Geometry.ts:13](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Geometry.ts#L13)

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`uuid`](ParametricGeometry.md#uuid)

***

### vertexBufferId

> **vertexBufferId**: `string` = `''`

Defined in: [scene/components/Geometry.ts:19](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Geometry.ts#L19)

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`vertexBufferId`](ParametricGeometry.md#vertexbufferid)

***

### vertexCount

> **vertexCount**: `number` = `0`

Defined in: [scene/components/Geometry.ts:21](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Geometry.ts#L21)

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`vertexCount`](ParametricGeometry.md#vertexcount)

***

### wireframeEdgeCount

> **wireframeEdgeCount**: `number` = `0`

Defined in: [scene/components/Geometry.ts:47](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Geometry.ts#L47)

Número de arestas wireframe (rawWireframeEdges.length / 2).

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`wireframeEdgeCount`](ParametricGeometry.md#wireframeedgecount)

***

### wireframeEdgesBufferId?

> `optional` **wireframeEdgesBufferId?**: `string`

Defined in: [scene/components/Geometry.ts:45](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Geometry.ts#L45)

ID do storage buffer de arestas de wireframe.

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`wireframeEdgesBufferId`](ParametricGeometry.md#wireframeedgesbufferid)

***

### wireframePositionsBufferId?

> `optional` **wireframePositionsBufferId?**: `string`

Defined in: [scene/components/Geometry.ts:43](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Geometry.ts#L43)

ID do storage buffer de posições de wireframe.

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`wireframePositionsBufferId`](ParametricGeometry.md#wireframepositionsbufferid)

## Methods

### allocateResource()

> **allocateResource**(`resourceManager`): `Promise`\<`void`\>

Defined in: [scene/components/Geometry.ts:55](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Geometry.ts#L55)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`allocateResource`](ParametricGeometry.md#allocateresource)

***

### disposeResource()

> **disposeResource**(`resourceManager`): `void`

Defined in: [scene/components/Geometry.ts:110](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Geometry.ts#L110)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`void`

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`disposeResource`](ParametricGeometry.md#disposeresource)

***

### markDirty()

> **markDirty**(): `void`

Defined in: [scene/components/Geometry.ts:49](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Geometry.ts#L49)

#### Returns

`void`

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`markDirty`](ParametricGeometry.md#markdirty)

***

### updateResource()

> **updateResource**(`resourceManager`): `Promise`\<`void`\>

Defined in: [scene/components/Geometry.ts:93](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Geometry.ts#L93)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`updateResource`](ParametricGeometry.md#updateresource)
