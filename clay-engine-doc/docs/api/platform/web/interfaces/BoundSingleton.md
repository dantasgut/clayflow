[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / BoundSingleton

# Interface: BoundSingleton\<R\>

Defined in: [src/scene/flows/slots.ts:269](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L269)

Resource único resolvido e o que a C2 alocou para ele.

## Extended by

- [`BoundWork`](BoundWork.md)

## Type Parameters

### R

`R` *extends* [`Resource`](Resource.md) = [`Resource`](Resource.md)

## Properties

### resource

> `readonly` **resource**: `R`

Defined in: [src/scene/flows/slots.ts:271](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L271)

O Resource resolvido.

## Methods

### bufferOf()

> **bufferOf**(`descId`): [`AnyBufferSpec`](../type-aliases/AnyBufferSpec.md) \| `undefined`

Defined in: [src/scene/flows/slots.ts:273](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L273)

Buffer alocado para o descritor `descId` do recurso.

#### Parameters

##### descId

`string`

#### Returns

[`AnyBufferSpec`](../type-aliases/AnyBufferSpec.md) \| `undefined`

***

### samplerOf()

> **samplerOf**(`descId`): [`SamplerSpec`](SamplerSpec.md) \| `undefined`

Defined in: [src/scene/flows/slots.ts:277](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L277)

Sampler alocado para o descritor `descId` do recurso.

#### Parameters

##### descId

`string`

#### Returns

[`SamplerSpec`](SamplerSpec.md) \| `undefined`

***

### textureViewOf()

> **textureViewOf**(`descId`): [`TextureViewSpec`](TextureViewSpec.md) \| `undefined`

Defined in: [src/scene/flows/slots.ts:275](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L275)

View alocada para o descritor de textura `descId` do recurso.

#### Parameters

##### descId

`string`

#### Returns

[`TextureViewSpec`](TextureViewSpec.md) \| `undefined`
