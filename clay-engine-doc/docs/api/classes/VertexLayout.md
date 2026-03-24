[**webgpu-engine**](../README.md)

***

[webgpu-engine](../README.md) / VertexLayout

# Class: VertexLayout

Defined in: [scene/data/VertexLayout.ts:27](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/data/VertexLayout.ts#L27)

Calculador Dinâmico de Layout Geomêtrico.
Remove a necessidade de hardcodar `stride` e matematícas de offset nos Arrays.

## Constructors

### Constructor

> **new VertexLayout**(`descriptors`): `VertexLayout`

Defined in: [scene/data/VertexLayout.ts:31](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/data/VertexLayout.ts#L31)

#### Parameters

##### descriptors

[`VertexAttributeDescriptor`](../interfaces/VertexAttributeDescriptor.md)[]

#### Returns

`VertexLayout`

## Properties

### attributes

> `readonly` **attributes**: `ComputedVertexAttribute`[]

Defined in: [scene/data/VertexLayout.ts:28](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/data/VertexLayout.ts#L28)

***

### stride

> `readonly` **stride**: `number`

Defined in: [scene/data/VertexLayout.ts:29](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/data/VertexLayout.ts#L29)

## Methods

### getGPUVertexBufferLayout()

> **getGPUVertexBufferLayout**(`stepMode?`): `GPUVertexBufferLayout`

Defined in: [scene/data/VertexLayout.ts:67](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/data/VertexLayout.ts#L67)

Gera o Layout nativo para ser inserido direto na criação da Pipeline WebGPU

#### Parameters

##### stepMode?

`GPUVertexStepMode` = `'vertex'`

#### Returns

`GPUVertexBufferLayout`
