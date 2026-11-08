[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / InferredResource

# Type Alias: InferredResource

> **InferredResource** = `"uniform"` \| `"read-only-storage"` \| `"storage"` \| \{ `texture`: \{ `multisampled`: `boolean`; `sampleType`: `"float"` \| `"unfilterable-float"` \| `"depth"` \| `"sint"` \| `"uint"`; `viewDimension`: `GPUTextureViewDimension`; \}; \} \| \{ `storageTexture`: \{ `access`: `"write-only"` \| `"read-only"` \| `"read-write"`; `format`: `GPUTextureFormat`; `viewDimension`: `GPUTextureViewDimension`; \}; \} \| \{ `sampler`: `"filtering"` \| `"comparison"`; \}

Defined in: [src/scene/systems/LayoutInferencer.ts:34](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/LayoutInferencer.ts#L34)

Recurso de uma entrada de layout inferida do tipo WGSL.

## Union Members

`"uniform"`

***

`"read-only-storage"`

***

`"storage"`

***

### Type Literal

\{ `texture`: \{ `multisampled`: `boolean`; `sampleType`: `"float"` \| `"unfilterable-float"` \| `"depth"` \| `"sint"` \| `"uint"`; `viewDimension`: `GPUTextureViewDimension`; \}; \}

#### texture

> `readonly` **texture**: `object`

Textura amostrada.

##### texture.multisampled

> `readonly` **multisampled**: `boolean`

`texture_multisampled_*`.

##### texture.sampleType

> `readonly` **sampleType**: `"float"` \| `"unfilterable-float"` \| `"depth"` \| `"sint"` \| `"uint"`

Tipo de amostra (`depth` em `texture_depth_*`; `unfilterable-float` em formatos não filtráveis).

##### texture.viewDimension

> `readonly` **viewDimension**: `GPUTextureViewDimension`

Dimensão da view.

***

### Type Literal

\{ `storageTexture`: \{ `access`: `"write-only"` \| `"read-only"` \| `"read-write"`; `format`: `GPUTextureFormat`; `viewDimension`: `GPUTextureViewDimension`; \}; \}

#### storageTexture

> `readonly` **storageTexture**: `object`

Textura de storage.

##### storageTexture.access

> `readonly` **access**: `"write-only"` \| `"read-only"` \| `"read-write"`

Acesso declarado no WGSL.

##### storageTexture.format

> `readonly` **format**: `GPUTextureFormat`

Formato declarado no WGSL.

##### storageTexture.viewDimension

> `readonly` **viewDimension**: `GPUTextureViewDimension`

Dimensão da view.

***

### Type Literal

\{ `sampler`: `"filtering"` \| `"comparison"`; \}

#### sampler

> `readonly` **sampler**: `"filtering"` \| `"comparison"`

Sampler (`sampler_comparison` → `comparison`).
