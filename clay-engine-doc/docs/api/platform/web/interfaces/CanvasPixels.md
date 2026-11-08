[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / CanvasPixels

# Interface: CanvasPixels

Defined in: [src/core/contracts/EngineCore.ts:83](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L83)

O quadro apresentado lido da GPU (`EngineCore.readCanvas`, spec 034), linhas sem preenchimento.

## Properties

### bytesPerPixel

> `readonly` **bytesPerPixel**: `number`

Defined in: [src/core/contracts/EngineCore.ts:89](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L89)

Bytes por pixel (4 nos formatos de 8 bits, 8 no `rgba16float`).

***

### data

> `readonly` **data**: `Uint8Array`

Defined in: [src/core/contracts/EngineCore.ts:91](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L91)

`width · height · bytesPerPixel` bytes, linha a linha, de cima para baixo.

***

### format

> `readonly` **format**: `GPUTextureFormat`

Defined in: [src/core/contracts/EngineCore.ts:87](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L87)

Formato da textura do canvas (`bgra8unorm`, `rgba8unorm` ou `rgba16float`).

***

### height

> `readonly` **height**: `number`

Defined in: [src/core/contracts/EngineCore.ts:85](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L85)

***

### width

> `readonly` **width**: `number`

Defined in: [src/core/contracts/EngineCore.ts:84](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L84)
