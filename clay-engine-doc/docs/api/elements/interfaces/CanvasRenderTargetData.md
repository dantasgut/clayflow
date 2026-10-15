[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / CanvasRenderTargetData

# Interface: CanvasRenderTargetData

Defined in: [elements/scene/RenderTarget.ts:44](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/scene/RenderTarget.ts#L44)

Dado de um `CanvasRenderTarget` (as opções com os defaults aplicados).

## Extends

- [`OffscreenRenderTargetData`](OffscreenRenderTargetData.md)

## Properties

### colorFormat

> **colorFormat**: `GPUTextureFormat`

Defined in: [elements/scene/RenderTarget.ts:36](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/scene/RenderTarget.ts#L36)

Formato da cor.

#### Inherited from

[`OffscreenRenderTargetData`](OffscreenRenderTargetData.md).[`colorFormat`](OffscreenRenderTargetData.md#colorformat)

***

### depthFormat

> **depthFormat**: `GPUTextureFormat`

Defined in: [elements/scene/RenderTarget.ts:38](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/scene/RenderTarget.ts#L38)

Formato da profundidade.

#### Inherited from

[`OffscreenRenderTargetData`](OffscreenRenderTargetData.md).[`depthFormat`](OffscreenRenderTargetData.md#depthformat)

***

### height

> **height**: `number`

Defined in: [elements/scene/RenderTarget.ts:34](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/scene/RenderTarget.ts#L34)

Altura em texels.

#### Inherited from

[`OffscreenRenderTargetData`](OffscreenRenderTargetData.md).[`height`](OffscreenRenderTargetData.md#height)

***

### sampleCount

> **sampleCount**: `1` \| `4`

Defined in: [elements/scene/RenderTarget.ts:40](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/scene/RenderTarget.ts#L40)

Amostras por pixel.

#### Inherited from

[`OffscreenRenderTargetData`](OffscreenRenderTargetData.md).[`sampleCount`](OffscreenRenderTargetData.md#samplecount)

***

### sizeFromCanvas

> **sizeFromCanvas**: `boolean`

Defined in: [elements/scene/RenderTarget.ts:46](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/scene/RenderTarget.ts#L46)

Tamanho segue o canvas.

***

### width

> **width**: `number`

Defined in: [elements/scene/RenderTarget.ts:32](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/scene/RenderTarget.ts#L32)

Largura em texels.

#### Inherited from

[`OffscreenRenderTargetData`](OffscreenRenderTargetData.md).[`width`](OffscreenRenderTargetData.md#width)
