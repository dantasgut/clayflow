# Class: ParametricGeometry

Defined in: [elements/geometry/ParametricGeometry.ts:32](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/elements/geometry/ParametricGeometry.ts#L32)

Geometria gerada por função paramétrica f(u, v) → vértice. (Camada 3)

Ponte entre fórmulas matemáticas e buffers GPU.
O usuário fornece a função de superfície; esta classe gera a malha
triangulada e os índices automaticamente.

u ∈ [0, 1] e v ∈ [0, 1] — mapeados sobre uma grade de (uSegments × vSegments).

## Example

```ts
// Toro
new ParametricGeometry((u, v) => {
    const theta = u * Math.PI * 2;
    const phi   = v * Math.PI * 2;
    const R = 1.0, r = 0.3;
    return {
        position: [(R + r*Math.cos(phi))*Math.cos(theta), r*Math.sin(phi), (R + r*Math.cos(phi))*Math.sin(theta)],
        normal:   [Math.cos(phi)*Math.cos(theta), Math.sin(phi), Math.cos(phi)*Math.sin(theta)],
        uv:       [u, v],
    };
}, 64, 32);
```

## Extends

- [`Geometry`](Geometry.md)

## Extended by

- [`SphereGeometry`](SphereGeometry.md)
- [`PlaneGeometry`](PlaneGeometry.md)

## Constructors

### Constructor

> **new ParametricGeometry**(`fn`, `uSegments?`, `vSegments?`): `ParametricGeometry`

Defined in: [elements/geometry/ParametricGeometry.ts:33](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/elements/geometry/ParametricGeometry.ts#L33)

#### Parameters

##### fn

(`u`, `v`) => `ParametricVertex`

##### uSegments?

`number` = `32`

##### vSegments?

`number` = `16`

#### Returns

`ParametricGeometry`

#### Overrides

[`Geometry`](Geometry.md).[`constructor`](Geometry.md#constructor)

## Properties

### indexBufferId?

> `optional` **indexBufferId?**: `string`

Defined in: [scene/components/Geometry.ts:20](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/components/Geometry.ts#L20)

#### Inherited from

[`Geometry`](Geometry.md).[`indexBufferId`](Geometry.md#indexbufferid)

***

### instanceCount

> **instanceCount**: `number` = `1`

Defined in: [scene/components/Geometry.ts:22](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/components/Geometry.ts#L22)

#### Inherited from

[`Geometry`](Geometry.md).[`instanceCount`](Geometry.md#instancecount)

***

### layer

> `readonly` **layer**: [`VISUAL_COMPONENT`](../enumerations/ResourceType.md#visual_component) = `ResourceType.VISUAL_COMPONENT`

Defined in: [scene/components/Geometry.ts:15](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/components/Geometry.ts#L15)

#### Inherited from

[`Geometry`](Geometry.md).[`layer`](Geometry.md#layer)

***

### layout

> **layout**: [`VertexLayout`](VertexLayout.md)

Defined in: [scene/components/Geometry.ts:23](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/components/Geometry.ts#L23)

#### Inherited from

[`Geometry`](Geometry.md).[`layout`](Geometry.md#layout)

***

### rawIndices

> **rawIndices**: `Uint16Array` \| `Uint32Array` \| `null` = `null`

Defined in: [scene/components/Geometry.ts:26](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/components/Geometry.ts#L26)

#### Inherited from

[`Geometry`](Geometry.md).[`rawIndices`](Geometry.md#rawindices)

***

### rawVertices

> **rawVertices**: `Float32Array` \| `null` = `null`

Defined in: [scene/components/Geometry.ts:25](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/components/Geometry.ts#L25)

#### Inherited from

[`Geometry`](Geometry.md).[`rawVertices`](Geometry.md#rawvertices)

***

### rawWireframeEdges

> **rawWireframeEdges**: `Uint32Array` \| `null` = `null`

Defined in: [scene/components/Geometry.ts:40](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/components/Geometry.ts#L40)

Lista explícita de arestas para wireframe (2 u32 por aresta: índices em rawWireframePositions).
Definida pelo autor da geometria — contém apenas as arestas reais da malha,
sem diagonais de triangulação.

#### Inherited from

[`Geometry`](Geometry.md).[`rawWireframeEdges`](Geometry.md#rawwireframeedges)

***

### rawWireframePositions

> **rawWireframePositions**: `Float32Array` \| `null` = `null`

Defined in: [scene/components/Geometry.ts:33](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/components/Geometry.ts#L33)

Lista explícita de posições de vértice para wireframe (3 floats por vértice).
Separada do VBO principal para ser independente de stride/normal/uv.
Definida pelo autor da geometria — nunca derivada da triangulação.

#### Inherited from

[`Geometry`](Geometry.md).[`rawWireframePositions`](Geometry.md#rawwireframepositions)

***

### state

> **state**: [`ResourceState`](../enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [scene/components/Geometry.ts:18](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/components/Geometry.ts#L18)

#### Inherited from

[`Geometry`](Geometry.md).[`state`](Geometry.md#state)

***

### type

> `readonly` **type**: `string` = `'Geometry'`

Defined in: [scene/components/Geometry.ts:16](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/components/Geometry.ts#L16)

#### Inherited from

[`Geometry`](Geometry.md).[`type`](Geometry.md#type)

***

### uuid

> `readonly` **uuid**: `string`

Defined in: [scene/components/Geometry.ts:13](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/components/Geometry.ts#L13)

#### Inherited from

[`Geometry`](Geometry.md).[`uuid`](Geometry.md#uuid)

***

### vertexBufferId

> **vertexBufferId**: `string` = `''`

Defined in: [scene/components/Geometry.ts:19](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/components/Geometry.ts#L19)

#### Inherited from

[`Geometry`](Geometry.md).[`vertexBufferId`](Geometry.md#vertexbufferid)

***

### vertexCount

> **vertexCount**: `number` = `0`

Defined in: [scene/components/Geometry.ts:21](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/components/Geometry.ts#L21)

#### Inherited from

[`Geometry`](Geometry.md).[`vertexCount`](Geometry.md#vertexcount)

***

### wireframeEdgeCount

> **wireframeEdgeCount**: `number` = `0`

Defined in: [scene/components/Geometry.ts:47](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/components/Geometry.ts#L47)

Número de arestas wireframe (rawWireframeEdges.length / 2).

#### Inherited from

[`Geometry`](Geometry.md).[`wireframeEdgeCount`](Geometry.md#wireframeedgecount)

***

### wireframeEdgesBufferId?

> `optional` **wireframeEdgesBufferId?**: `string`

Defined in: [scene/components/Geometry.ts:45](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/components/Geometry.ts#L45)

ID do storage buffer de arestas de wireframe.

#### Inherited from

[`Geometry`](Geometry.md).[`wireframeEdgesBufferId`](Geometry.md#wireframeedgesbufferid)

***

### wireframePositionsBufferId?

> `optional` **wireframePositionsBufferId?**: `string`

Defined in: [scene/components/Geometry.ts:43](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/components/Geometry.ts#L43)

ID do storage buffer de posições de wireframe.

#### Inherited from

[`Geometry`](Geometry.md).[`wireframePositionsBufferId`](Geometry.md#wireframepositionsbufferid)

## Accessors

### isGpuManaged

#### Get Signature

> **get** **isGpuManaged**(): `boolean`

Defined in: [scene/components/Geometry.ts:62](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/components/Geometry.ts#L62)

Retorna true quando o compute shader é o escritor ativo do vertex buffer.
Enquanto true, markDirty() é no-op e o ResourceLoader suprime uploads.

##### Returns

`boolean`

#### Inherited from

[`Geometry`](Geometry.md).[`isGpuManaged`](Geometry.md#isgpumanaged)

## Methods

### allocateResource()

> **allocateResource**(`resourceManager`): `Promise`\<`void`\>

Defined in: [scene/components/Geometry.ts:92](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/components/Geometry.ts#L92)

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

Defined in: [scene/components/Geometry.ts:147](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/components/Geometry.ts#L147)

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

Defined in: [scene/components/Geometry.ts:71](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/components/Geometry.ts#L71)

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

Defined in: [scene/components/Geometry.ts:80](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/components/Geometry.ts#L80)

Devolve a propriedade do vertex buffer ao pipeline CPU.
Transiciona para Dirty, forçando re-upload de rawVertices no próximo frame.

#### Returns

`void`

#### Inherited from

[`Geometry`](Geometry.md).[`exitGpuManagedMode`](Geometry.md#exitgpumanagedmode)

***

### markDirty()

> **markDirty**(): `void`

Defined in: [scene/components/Geometry.ts:85](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/components/Geometry.ts#L85)

#### Returns

`void`

#### Inherited from

[`Geometry`](Geometry.md).[`markDirty`](Geometry.md#markdirty)

***

### updateResource()

> **updateResource**(`resourceManager`): `Promise`\<`void`\>

Defined in: [scene/components/Geometry.ts:130](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/components/Geometry.ts#L130)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`Geometry`](Geometry.md).[`updateResource`](Geometry.md#updateresource)
