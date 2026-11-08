[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / WgslBindingKind

# Type Alias: WgslBindingKind

> **WgslBindingKind** = \{ `storage`: `"read"` \| `"read_write"`; \} \| \{ `uniform`: `true`; \} \| \{ `texture`: \{ `dimension?`: [`WgslTextureDimension`](WgslTextureDimension.md); `multisampled?`: `boolean`; `sample`: `"f32"` \| `"i32"` \| `"u32"` \| `"depth"`; \}; \} \| \{ `storageTexture`: \{ `access`: `"read"` \| `"write"` \| `"read_write"`; `dimension?`: [`WgslTextureDimension`](WgslTextureDimension.md); `format`: `GPUTextureFormat`; \}; \} \| \{ `sampler`: `"filtering"` \| `"comparison"`; \}

Defined in: [src/scene/shaders/WgslResource.ts:21](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslResource.ts#L21)

Como o recurso é ligado (address space, textura, amostrador).

## Union Members

### Type Literal

\{ `storage`: `"read"` \| `"read_write"`; \}

#### storage

> `readonly` **storage**: `"read"` \| `"read_write"`

Buffer de storage com o acesso dado.

***

### Type Literal

\{ `uniform`: `true`; \}

#### uniform

> `readonly` **uniform**: `true`

Buffer uniform.

***

### Type Literal

\{ `texture`: \{ `dimension?`: [`WgslTextureDimension`](WgslTextureDimension.md); `multisampled?`: `boolean`; `sample`: `"f32"` \| `"i32"` \| `"u32"` \| `"depth"`; \}; \}

#### texture

> `readonly` **texture**: `object`

Textura amostrada.

##### texture.dimension?

> `readonly` `optional` **dimension?**: [`WgslTextureDimension`](WgslTextureDimension.md)

Dimensão (padrão `2d`).

##### texture.multisampled?

> `readonly` `optional` **multisampled?**: `boolean`

Multiamostrada.

##### texture.sample

> `readonly` **sample**: `"f32"` \| `"i32"` \| `"u32"` \| `"depth"`

Tipo da amostra (`depth` = `texture_depth_*`).

***

### Type Literal

\{ `storageTexture`: \{ `access`: `"read"` \| `"write"` \| `"read_write"`; `dimension?`: [`WgslTextureDimension`](WgslTextureDimension.md); `format`: `GPUTextureFormat`; \}; \}

#### storageTexture

> `readonly` **storageTexture**: `object`

Textura de storage.

##### storageTexture.access

> `readonly` **access**: `"read"` \| `"write"` \| `"read_write"`

Acesso.

##### storageTexture.dimension?

> `readonly` `optional` **dimension?**: [`WgslTextureDimension`](WgslTextureDimension.md)

Dimensão (padrão `2d`).

##### storageTexture.format

> `readonly` **format**: `GPUTextureFormat`

Formato.

***

### Type Literal

\{ `sampler`: `"filtering"` \| `"comparison"`; \}

#### sampler

> `readonly` **sampler**: `"filtering"` \| `"comparison"`

Amostrador.
