# Interface: RenderQueue

Defined in: [scene/rendering/RenderQueue.ts:68](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/rendering/RenderQueue.ts#L68)

Interface Oficial que a Camada 3 consumirá.
Arrays Lineares 100% blindados e livres de orientação a objetos gordos.

## Properties

### lights

> `readonly` **lights**: [`RenderLight`](RenderLight.md)[]

Defined in: [scene/rendering/RenderQueue.ts:76](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/rendering/RenderQueue.ts#L76)

***

### opaqueGroups

> `readonly` **opaqueGroups**: `Map`\<`string`, [`RenderCommand`](RenderCommand.md)[]\>

Defined in: [scene/rendering/RenderQueue.ts:70](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/rendering/RenderQueue.ts#L70)

***

### transparentList

> `readonly` **transparentList**: [`RenderCommand`](RenderCommand.md)[]

Defined in: [scene/rendering/RenderQueue.ts:73](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/rendering/RenderQueue.ts#L73)

## Methods

### acquireFloat32()

> **acquireFloat32**(`size`): `Float32Array`

Defined in: [scene/rendering/RenderQueue.ts:81](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/rendering/RenderQueue.ts#L81)

Obtém um Float32Array do pool interno — evita alocações GC por frame.

#### Parameters

##### size

`number`

#### Returns

`Float32Array`

***

### clear()

> **clear**(): `void`

Defined in: [scene/rendering/RenderQueue.ts:78](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/rendering/RenderQueue.ts#L78)

#### Returns

`void`
