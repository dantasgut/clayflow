[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / RenderTargetOptions

# Interface: RenderTargetOptions

Defined in: [elements/scene/RenderTarget.ts:11](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/scene/RenderTarget.ts#L11)

Opções de configuração de um render target. `sizeFromCanvas` aplica
apenas a `CanvasRenderTarget` (faz a textura espelhar canvas dimensions).

## Properties

### colorFormat?

> `optional` **colorFormat?**: `GPUTextureFormat`

Defined in: [elements/scene/RenderTarget.ts:17](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/scene/RenderTarget.ts#L17)

Formato do color attachment. Default: 'bgra8unorm' (canvas) ou 'rgba16float' (offscreen).

***

### depthFormat?

> `optional` **depthFormat?**: `GPUTextureFormat`

Defined in: [elements/scene/RenderTarget.ts:19](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/scene/RenderTarget.ts#L19)

Formato do depth-stencil attachment. Default: 'depth24plus'.

***

### height?

> `optional` **height?**: `number`

Defined in: [elements/scene/RenderTarget.ts:15](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/scene/RenderTarget.ts#L15)

Altura em pixels. Default: 0 ou 1024.

***

### sampleCount?

> `optional` **sampleCount?**: `1` \| `4`

Defined in: [elements/scene/RenderTarget.ts:21](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/scene/RenderTarget.ts#L21)

MSAA: 1 (sem antialiasing) ou 4. Default: 1.

***

### sizeFromCanvas?

> `optional` **sizeFromCanvas?**: `boolean`

Defined in: [elements/scene/RenderTarget.ts:26](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/scene/RenderTarget.ts#L26)

Quando true (default em CanvasRenderTarget), as dimensões espelham
`canvas.width × canvas.height × DPR`. Listener de resize ajusta automaticamente.

***

### width?

> `optional` **width?**: `number`

Defined in: [elements/scene/RenderTarget.ts:13](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/scene/RenderTarget.ts#L13)

Largura em pixels (ignorado se sizeFromCanvas=true). Default: 0 ou 1024.
