# Class: SphereGeometry

Defined in: [elements/geometry/SphereGeometry.ts:16](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/elements/geometry/SphereGeometry.ts#L16)

Esfera unitária gerada por coordenadas esféricas. (Camada 3)

Parametrização:
  θ (azimute) = u · 2π   ∈ [0, 2π]
  φ (polar)   = v · π    ∈ [0, π]

  x = r · sin(φ) · cos(θ)
  y = r · cos(φ)
  z = r · sin(φ) · sin(θ)

A normal é o vetor unitário na direção do ponto (esfera centrada na origem).

## Extends

- [`ParametricGeometry`](ParametricGeometry.md)

## Constructors

### Constructor

> **new SphereGeometry**(`radius?`, `widthSegments?`, `heightSegments?`): `SphereGeometry`

Defined in: [elements/geometry/SphereGeometry.ts:17](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/elements/geometry/SphereGeometry.ts#L17)

#### Parameters

##### radius?

`number` = `1`

##### widthSegments?

`number` = `32`

##### heightSegments?

`number` = `16`

#### Returns

`SphereGeometry`

#### Overrides

[`ParametricGeometry`](ParametricGeometry.md).[`constructor`](ParametricGeometry.md#constructor)

## Properties

### indexBufferId?

> `optional` **indexBufferId?**: `string`

Defined in: [scene/components/Geometry.ts:27](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Geometry.ts#L27)

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`indexBufferId`](ParametricGeometry.md#indexbufferid)

***

### instanceCount

> **instanceCount**: `number` = `1`

Defined in: [scene/components/Geometry.ts:29](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Geometry.ts#L29)

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`instanceCount`](ParametricGeometry.md#instancecount)

***

### layer

> `readonly` **layer**: [`VISUAL_COMPONENT`](../enumerations/ResourceType.md#visual_component) = `ResourceType.VISUAL_COMPONENT`

Defined in: [scene/components/Geometry.ts:17](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Geometry.ts#L17)

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`layer`](ParametricGeometry.md#layer)

***

### layout

> **layout**: [`VertexLayout`](VertexLayout.md)

Defined in: [scene/components/Geometry.ts:30](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Geometry.ts#L30)

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`layout`](ParametricGeometry.md#layout)

***

### rawIndices

> **rawIndices**: `Uint16Array` \| `Uint32Array` \| `null` = `null`

Defined in: [scene/components/Geometry.ts:33](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Geometry.ts#L33)

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`rawIndices`](ParametricGeometry.md#rawindices)

***

### rawVertices

> **rawVertices**: `Float32Array` \| `null` = `null`

Defined in: [scene/components/Geometry.ts:32](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Geometry.ts#L32)

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`rawVertices`](ParametricGeometry.md#rawvertices)

***

### rawWireframeEdges

> **rawWireframeEdges**: `Uint32Array` \| `null` = `null`

Defined in: [scene/components/Geometry.ts:47](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Geometry.ts#L47)

Lista explícita de arestas para wireframe (2 u32 por aresta: índices em rawWireframePositions).
Definida pelo autor da geometria — contém apenas as arestas reais da malha,
sem diagonais de triangulação.

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`rawWireframeEdges`](ParametricGeometry.md#rawwireframeedges)

***

### rawWireframePositions

> **rawWireframePositions**: `Float32Array` \| `null` = `null`

Defined in: [scene/components/Geometry.ts:40](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Geometry.ts#L40)

Lista explícita de posições de vértice para wireframe (3 floats por vértice).
Separada do VBO principal para ser independente de stride/normal/uv.
Definida pelo autor da geometria — nunca derivada da triangulação.

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`rawWireframePositions`](ParametricGeometry.md#rawwireframepositions)

***

### state

> **state**: [`ResourceState`](../enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [scene/components/Geometry.ts:20](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Geometry.ts#L20)

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`state`](ParametricGeometry.md#state)

***

### type

> `readonly` **type**: `string` = `'Geometry'`

Defined in: [scene/components/Geometry.ts:18](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Geometry.ts#L18)

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`type`](ParametricGeometry.md#type)

***

### uuid

> `readonly` **uuid**: `string`

Defined in: [scene/components/Geometry.ts:15](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Geometry.ts#L15)

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`uuid`](ParametricGeometry.md#uuid)

***

### vertexBufferId

> **vertexBufferId**: `string` = `''`

Defined in: [scene/components/Geometry.ts:26](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Geometry.ts#L26)

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`vertexBufferId`](ParametricGeometry.md#vertexbufferid)

***

### vertexCount

> **vertexCount**: `number` = `0`

Defined in: [scene/components/Geometry.ts:28](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Geometry.ts#L28)

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`vertexCount`](ParametricGeometry.md#vertexcount)

***

### wireframeEdgeCount

> **wireframeEdgeCount**: `number` = `0`

Defined in: [scene/components/Geometry.ts:54](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Geometry.ts#L54)

Número de arestas wireframe (rawWireframeEdges.length / 2).

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`wireframeEdgeCount`](ParametricGeometry.md#wireframeedgecount)

***

### wireframeEdgesBufferId?

> `optional` **wireframeEdgesBufferId?**: `string`

Defined in: [scene/components/Geometry.ts:52](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Geometry.ts#L52)

ID do storage buffer de arestas de wireframe.

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`wireframeEdgesBufferId`](ParametricGeometry.md#wireframeedgesbufferid)

***

### wireframePositionsBufferId?

> `optional` **wireframePositionsBufferId?**: `string`

Defined in: [scene/components/Geometry.ts:50](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Geometry.ts#L50)

ID do storage buffer de posições de wireframe.

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`wireframePositionsBufferId`](ParametricGeometry.md#wireframepositionsbufferid)

## Accessors

### currentResourceState

#### Get Signature

> **get** **currentResourceState**(): `ResourceStateHandler`

Defined in: [scene/components/Geometry.ts:23](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Geometry.ts#L23)

Handler do estado atual — encapsula capacidades do ciclo de vida GPU.

##### Returns

`ResourceStateHandler`

Handler do estado atual — consulta de capacidades pelos consumidores.

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`currentResourceState`](ParametricGeometry.md#currentresourcestate)

***

### isGpuManaged

#### Get Signature

> **get** **isGpuManaged**(): `boolean`

Defined in: [scene/components/Geometry.ts:69](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Geometry.ts#L69)

Retorna true quando o compute shader é o escritor ativo do vertex buffer.
Enquanto true, markDirty() é no-op e o ResourceLoader suprime uploads.

##### Returns

`boolean`

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`isGpuManaged`](ParametricGeometry.md#isgpumanaged)

## Methods

### allocateResource()

> **allocateResource**(`resourceManager`): `Promise`\<`void`\>

Defined in: [scene/components/Geometry.ts:97](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Geometry.ts#L97)

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

Defined in: [scene/components/Geometry.ts:152](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Geometry.ts#L152)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`void`

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`disposeResource`](ParametricGeometry.md#disposeresource)

***

### enterGpuManagedMode()

> **enterGpuManagedMode**(): `void`

Defined in: [scene/components/Geometry.ts:78](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Geometry.ts#L78)

Transfere a propriedade do vertex buffer para o pipeline GPU.
Pré-condição: state === Ready (geometry já alocada na VRAM).
Após a chamada, markDirty() é ignorado até exitGpuManagedMode().

#### Returns

`void`

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`enterGpuManagedMode`](ParametricGeometry.md#entergpumanagedmode)

***

### exitGpuManagedMode()

> **exitGpuManagedMode**(): `void`

Defined in: [scene/components/Geometry.ts:87](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Geometry.ts#L87)

Devolve a propriedade do vertex buffer ao pipeline CPU.
Transiciona para Dirty, forçando re-upload de rawVertices no próximo frame.

#### Returns

`void`

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`exitGpuManagedMode`](ParametricGeometry.md#exitgpumanagedmode)

***

### markDirty()

> **markDirty**(): `void`

Defined in: [scene/components/Geometry.ts:92](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Geometry.ts#L92)

#### Returns

`void`

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`markDirty`](ParametricGeometry.md#markdirty)

***

### updateResource()

> **updateResource**(`resourceManager`): `Promise`\<`void`\>

Defined in: [scene/components/Geometry.ts:135](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Geometry.ts#L135)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`updateResource`](ParametricGeometry.md#updateresource)
