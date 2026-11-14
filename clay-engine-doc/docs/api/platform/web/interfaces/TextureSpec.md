[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / TextureSpec

# Interface: TextureSpec

Defined in: [src/core/contracts/specs/TextureSpec.ts:9](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/TextureSpec.ts#L9)

Spec de uma GPU texture. Materializada por `core.create<TextureSpec>()`
em GPUTexture, indexada por specHash. Para criar uma view sobre a texture,
use `TextureViewSpec` referenciando o `source: TextureSpec`.

`byteSize` no GpuResourceStore = `width × height × depth × bytesPerPixel(format)`,
somado por todos os mip levels e sample count.

## Properties

### depthOrArrayLayers?

> `readonly` `optional` **depthOrArrayLayers?**: `number`

Defined in: [src/core/contracts/specs/TextureSpec.ts:26](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/TextureSpec.ts#L26)

Para 3D textures = depth slices. Para 2d-array = número de layers.
Default: 1 (2D simples).

***

### dimension?

> `readonly` `optional` **dimension?**: `"1d"` \| `"2d"` \| `"3d"`

Defined in: [src/core/contracts/specs/TextureSpec.ts:17](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/TextureSpec.ts#L17)

Tipo de textura. Default: '2d'.

***

### discriminator?

> `readonly` `optional` **discriminator?**: `string`

Defined in: [src/core/contracts/specs/TextureSpec.ts:13](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/TextureSpec.ts#L13)

Discriminador semântico (e.g. 'shadow_depth', 'forward_color:800x600').

***

### format

> `readonly` **format**: `GPUTextureFormat`

Defined in: [src/core/contracts/specs/TextureSpec.ts:28](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/TextureSpec.ts#L28)

Formato pixel (e.g. 'rgba8unorm', 'depth32float').

***

### height

> `readonly` **height**: `number`

Defined in: [src/core/contracts/specs/TextureSpec.ts:21](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/TextureSpec.ts#L21)

Altura em texels.

***

### kind

> `readonly` **kind**: `"texture"`

Defined in: [src/core/contracts/specs/TextureSpec.ts:11](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/TextureSpec.ts#L11)

Discriminador de tipo — sempre `'texture'`.

***

### label?

> `readonly` `optional` **label?**: `string`

Defined in: [src/core/contracts/specs/TextureSpec.ts:15](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/TextureSpec.ts#L15)

Label para debugging (DevTools/RenderDoc).

***

### mipLevelCount?

> `readonly` `optional` **mipLevelCount?**: `number`

Defined in: [src/core/contracts/specs/TextureSpec.ts:32](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/TextureSpec.ts#L32)

Quantos mip levels alocar. Default: 1 (sem mipmaps).

***

### sampleCount?

> `readonly` `optional` **sampleCount?**: `1` \| `4`

Defined in: [src/core/contracts/specs/TextureSpec.ts:34](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/TextureSpec.ts#L34)

MSAA: 1 (sem antialiasing) ou 4. Default: 1.

***

### usage

> `readonly` **usage**: `number`

Defined in: [src/core/contracts/specs/TextureSpec.ts:30](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/TextureSpec.ts#L30)

Bitmask `GPUTextureUsage.*` (RENDER_ATTACHMENT, TEXTURE_BINDING, etc.).

***

### viewFormats?

> `readonly` `optional` **viewFormats?**: readonly `GPUTextureFormat`[]

Defined in: [src/core/contracts/specs/TextureSpec.ts:39](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/TextureSpec.ts#L39)

Formats adicionais permitidos para views sobre esta texture
(e.g. ['rgba8unorm-srgb'] para view sRGB de uma texture rgba8unorm).

***

### width

> `readonly` **width**: `number`

Defined in: [src/core/contracts/specs/TextureSpec.ts:19](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/TextureSpec.ts#L19)

Largura em texels.
