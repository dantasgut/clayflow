[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / TextureViewSpec

# Interface: TextureViewSpec

Defined in: [src/core/contracts/specs/TextureViewSpec.ts:9](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/TextureViewSpec.ts#L9)

View sobre uma `TextureSpec`. WebGPU exige views (não a texture diretamente)
em quase todos os bindings (render attachments, sampled textures em shader,
storage textures). Uma textura pode ter múltiplas views com formatos/aspects/
subresources distintos.

## Properties

### arrayLayerCount?

> `readonly` `optional` **arrayLayerCount?**: `number`

Defined in: [src/core/contracts/specs/TextureViewSpec.ts:29](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/TextureViewSpec.ts#L29)

Quantos layers a view enxerga. Default: todos.

***

### aspect?

> `readonly` `optional` **aspect?**: `"all"` \| `"depth-only"` \| `"stencil-only"`

Defined in: [src/core/contracts/specs/TextureViewSpec.ts:35](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/TextureViewSpec.ts#L35)

Subresource aspect:
  - `all` (default): cobre depth+stencil em formats combinados.
  - `depth-only` / `stencil-only`: para bindings que precisam de um deles.

***

### baseArrayLayer?

> `readonly` `optional` **baseArrayLayer?**: `number`

Defined in: [src/core/contracts/specs/TextureViewSpec.ts:27](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/TextureViewSpec.ts#L27)

Primeiro array layer visível. Default: 0.

***

### baseMipLevel?

> `readonly` `optional` **baseMipLevel?**: `number`

Defined in: [src/core/contracts/specs/TextureViewSpec.ts:23](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/TextureViewSpec.ts#L23)

Primeiro mip level visível na view. Default: 0.

***

### dimension?

> `readonly` `optional` **dimension?**: `GPUTextureViewDimension`

Defined in: [src/core/contracts/specs/TextureViewSpec.ts:19](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/TextureViewSpec.ts#L19)

Dimensão da view ('2d', '2d-array', 'cube', etc.). Default: derivada da source.

***

### discriminator?

> `readonly` `optional` **discriminator?**: `string`

Defined in: [src/core/contracts/specs/TextureViewSpec.ts:13](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/TextureViewSpec.ts#L13)

Discriminador semântico (parte do specHash).

***

### format?

> `readonly` `optional` **format?**: `GPUTextureFormat`

Defined in: [src/core/contracts/specs/TextureViewSpec.ts:21](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/TextureViewSpec.ts#L21)

Format override (deve estar em source.viewFormats). Default: source.format.

***

### kind

> `readonly` **kind**: `"textureview"`

Defined in: [src/core/contracts/specs/TextureViewSpec.ts:11](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/TextureViewSpec.ts#L11)

Discriminador de tipo — sempre `'textureview'`.

***

### label?

> `readonly` `optional` **label?**: `string`

Defined in: [src/core/contracts/specs/TextureViewSpec.ts:15](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/TextureViewSpec.ts#L15)

Label para debugging (DevTools/RenderDoc).

***

### mipLevelCount?

> `readonly` `optional` **mipLevelCount?**: `number`

Defined in: [src/core/contracts/specs/TextureViewSpec.ts:25](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/TextureViewSpec.ts#L25)

Quantos mips a view enxerga a partir de baseMipLevel. Default: todos.

***

### source

> `readonly` **source**: [`TextureSpec`](TextureSpec.md)

Defined in: [src/core/contracts/specs/TextureViewSpec.ts:17](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/specs/TextureViewSpec.ts#L17)

Texture-fonte sobre a qual a view é construída.
