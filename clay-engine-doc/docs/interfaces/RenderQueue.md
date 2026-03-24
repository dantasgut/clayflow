# Interface: RenderQueue

Defined in: [scene/rendering/RenderQueue.ts:65](https://github.com/dantasgut/clayflow/blob/65554994d1b604a896571b1ce5763d12e7f64783/src/scene/rendering/RenderQueue.ts#L65)

Interface Oficial que a Camada 3 consumirá.
Arrays Lineares 100% blindados e livres de orientação a objetos gordos.

## Properties

### lights

> `readonly` **lights**: [`RenderLight`](RenderLight.md)[]

Defined in: [scene/rendering/RenderQueue.ts:73](https://github.com/dantasgut/clayflow/blob/65554994d1b604a896571b1ce5763d12e7f64783/src/scene/rendering/RenderQueue.ts#L73)

***

### opaqueGroups

> `readonly` **opaqueGroups**: `Map`\<`string`, [`RenderCommand`](RenderCommand.md)[]\>

Defined in: [scene/rendering/RenderQueue.ts:67](https://github.com/dantasgut/clayflow/blob/65554994d1b604a896571b1ce5763d12e7f64783/src/scene/rendering/RenderQueue.ts#L67)

***

### transparentList

> `readonly` **transparentList**: [`RenderCommand`](RenderCommand.md)[]

Defined in: [scene/rendering/RenderQueue.ts:70](https://github.com/dantasgut/clayflow/blob/65554994d1b604a896571b1ce5763d12e7f64783/src/scene/rendering/RenderQueue.ts#L70)

## Methods

### acquireFloat32()

> **acquireFloat32**(`size`): `Float32Array`

Defined in: [scene/rendering/RenderQueue.ts:78](https://github.com/dantasgut/clayflow/blob/65554994d1b604a896571b1ce5763d12e7f64783/src/scene/rendering/RenderQueue.ts#L78)

Obtém um Float32Array do pool interno — evita alocações GC por frame.

#### Parameters

##### size

`number`

#### Returns

`Float32Array`

***

### clear()

> **clear**(): `void`

Defined in: [scene/rendering/RenderQueue.ts:75](https://github.com/dantasgut/clayflow/blob/65554994d1b604a896571b1ce5763d12e7f64783/src/scene/rendering/RenderQueue.ts#L75)

#### Returns

`void`
