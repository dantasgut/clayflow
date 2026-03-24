[**webgpu-engine**](../README.md)

***

[webgpu-engine](../README.md) / Geometry

# Abstract Class: Geometry

Defined in: [scene/components/Geometry.ts:11](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L11)

Componente Lógico (ECS) representando a malha matemática de um Nó.
Componente puro — não é um nó da cena. Deve ser adicionado a um Mesh.

## Extended by

- [`BoxGeometry`](BoxGeometry.md)
- [`ParametricGeometry`](ParametricGeometry.md)

## Implements

- [`Component`](../interfaces/Component.md)

## Constructors

### Constructor

> **new Geometry**(): `Geometry`

#### Returns

`Geometry`

## Properties

### indexBufferId?

> `optional` **indexBufferId?**: `string`

Defined in: [scene/components/Geometry.ts:20](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L20)

***

### instanceCount

> **instanceCount**: `number` = `1`

Defined in: [scene/components/Geometry.ts:22](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L22)

***

### layer

> `readonly` **layer**: [`VISUAL_COMPONENT`](../enumerations/ResourceType.md#visual_component) = `ResourceType.VISUAL_COMPONENT`

Defined in: [scene/components/Geometry.ts:15](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L15)

#### Implementation of

[`Component`](../interfaces/Component.md).[`layer`](../interfaces/Component.md#layer)

***

### layout

> **layout**: [`VertexLayout`](VertexLayout.md)

Defined in: [scene/components/Geometry.ts:23](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L23)

***

### rawIndices

> **rawIndices**: `Uint16Array`\<`ArrayBufferLike`\> \| `Uint32Array`\<`ArrayBufferLike`\> \| `null` = `null`

Defined in: [scene/components/Geometry.ts:26](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L26)

***

### rawVertices

> **rawVertices**: `Float32Array`\<`ArrayBufferLike`\> \| `null` = `null`

Defined in: [scene/components/Geometry.ts:25](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L25)

***

### rawWireframeEdges

> **rawWireframeEdges**: `Uint32Array`\<`ArrayBufferLike`\> \| `null` = `null`

Defined in: [scene/components/Geometry.ts:40](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L40)

Lista explícita de arestas para wireframe (2 u32 por aresta: índices em rawWireframePositions).
Definida pelo autor da geometria — contém apenas as arestas reais da malha,
sem diagonais de triangulação.

***

### rawWireframePositions

> **rawWireframePositions**: `Float32Array`\<`ArrayBufferLike`\> \| `null` = `null`

Defined in: [scene/components/Geometry.ts:33](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L33)

Lista explícita de posições de vértice para wireframe (3 floats por vértice).
Separada do VBO principal para ser independente de stride/normal/uv.
Definida pelo autor da geometria — nunca derivada da triangulação.

***

### state

> **state**: [`ResourceState`](../enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [scene/components/Geometry.ts:18](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L18)

#### Implementation of

[`Component`](../interfaces/Component.md).[`state`](../interfaces/Component.md#state)

***

### type

> `readonly` **type**: `string` = `'Geometry'`

Defined in: [scene/components/Geometry.ts:16](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L16)

#### Implementation of

[`Component`](../interfaces/Component.md).[`type`](../interfaces/Component.md#type)

***

### uuid

> `readonly` **uuid**: `string`

Defined in: [scene/components/Geometry.ts:13](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L13)

#### Implementation of

[`Component`](../interfaces/Component.md).[`uuid`](../interfaces/Component.md#uuid)

***

### vertexBufferId

> **vertexBufferId**: `string` = `''`

Defined in: [scene/components/Geometry.ts:19](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L19)

***

### vertexCount

> **vertexCount**: `number` = `0`

Defined in: [scene/components/Geometry.ts:21](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L21)

***

### wireframeEdgeCount

> **wireframeEdgeCount**: `number` = `0`

Defined in: [scene/components/Geometry.ts:47](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L47)

Número de arestas wireframe (rawWireframeEdges.length / 2).

***

### wireframeEdgesBufferId?

> `optional` **wireframeEdgesBufferId?**: `string`

Defined in: [scene/components/Geometry.ts:45](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L45)

ID do storage buffer de arestas de wireframe.

***

### wireframePositionsBufferId?

> `optional` **wireframePositionsBufferId?**: `string`

Defined in: [scene/components/Geometry.ts:43](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L43)

ID do storage buffer de posições de wireframe.

## Methods

### allocateResource()

> **allocateResource**(`resourceManager`): `Promise`\<`void`\>

Defined in: [scene/components/Geometry.ts:55](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L55)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Component`](../interfaces/Component.md).[`allocateResource`](../interfaces/Component.md#allocateresource)

***

### disposeResource()

> **disposeResource**(`resourceManager`): `void`

Defined in: [scene/components/Geometry.ts:110](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L110)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`void`

#### Implementation of

[`Component`](../interfaces/Component.md).[`disposeResource`](../interfaces/Component.md#disposeresource)

***

### markDirty()

> **markDirty**(): `void`

Defined in: [scene/components/Geometry.ts:49](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L49)

#### Returns

`void`

***

### updateResource()

> **updateResource**(`resourceManager`): `Promise`\<`void`\>

Defined in: [scene/components/Geometry.ts:93](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Geometry.ts#L93)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Component`](../interfaces/Component.md).[`updateResource`](../interfaces/Component.md#updateresource)
