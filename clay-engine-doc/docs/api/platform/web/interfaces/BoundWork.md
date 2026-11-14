[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / BoundWork

# Interface: BoundWork\<R\>

Defined in: [src/scene/flows/slots.ts:281](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L281)

O Resource de trabalho do Flow resolvido (`slot.work`): o singleton dele e o stride das regiões.

## Extends

- [`BoundSingleton`](BoundSingleton.md)\<`R`\>

## Type Parameters

### R

`R` *extends* [`Resource`](Resource.md) = [`Resource`](Resource.md)

## Properties

### resource

> `readonly` **resource**: `R`

Defined in: [src/scene/flows/slots.ts:271](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L271)

O Resource resolvido.

#### Inherited from

[`BoundSingleton`](BoundSingleton.md).[`resource`](BoundSingleton.md#resource)

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

#### Inherited from

[`BoundSingleton`](BoundSingleton.md).[`bufferOf`](BoundSingleton.md#bufferof)

***

### regionStride()

> **regionStride**(`descId`): `number`

Defined in: [src/scene/flows/slots.ts:286](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L286)

Distância em bytes entre as regiões do uniforme por região `descId` (o offset da região `i` é `i × stride`).

#### Parameters

##### descId

`string`

#### Returns

`number`

#### Throws

Error se o descritor não tem `regions`.

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

#### Inherited from

[`BoundSingleton`](BoundSingleton.md).[`samplerOf`](BoundSingleton.md#samplerof)

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

#### Inherited from

[`BoundSingleton`](BoundSingleton.md).[`textureViewOf`](BoundSingleton.md#textureviewof)
