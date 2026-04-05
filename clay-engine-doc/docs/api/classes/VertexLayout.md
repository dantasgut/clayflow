# Class: VertexLayout

Defined in: [scene/data/VertexLayout.ts:27](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/data/VertexLayout.ts#L27)

Calculador Dinâmico de Layout Geomêtrico.
Remove a necessidade de hardcodar `stride` e matematícas de offset nos Arrays.

## Constructors

### Constructor

> **new VertexLayout**(`descriptors`): `VertexLayout`

Defined in: [scene/data/VertexLayout.ts:31](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/data/VertexLayout.ts#L31)

#### Parameters

##### descriptors

[`VertexAttributeDescriptor`](../interfaces/VertexAttributeDescriptor.md)[]

#### Returns

`VertexLayout`

## Properties

### attributes

> `readonly` **attributes**: `ComputedVertexAttribute`[]

Defined in: [scene/data/VertexLayout.ts:28](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/data/VertexLayout.ts#L28)

***

### stride

> `readonly` **stride**: `number`

Defined in: [scene/data/VertexLayout.ts:29](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/data/VertexLayout.ts#L29)

## Methods

### getGPUVertexBufferLayout()

> **getGPUVertexBufferLayout**(`stepMode?`): `GPUVertexBufferLayout`

Defined in: [scene/data/VertexLayout.ts:67](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/data/VertexLayout.ts#L67)

Gera o Layout nativo para ser inserido direto na criação da Pipeline WebGPU

#### Parameters

##### stepMode?

`GPUVertexStepMode` = `'vertex'`

#### Returns

`GPUVertexBufferLayout`
