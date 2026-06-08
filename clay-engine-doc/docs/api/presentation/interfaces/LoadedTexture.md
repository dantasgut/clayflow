[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / LoadedTexture

# Interface: LoadedTexture

Defined in: [presentation/assets/TextureLoader.ts:5](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/TextureLoader.ts#L5)

Texture asset carregada — bitmap + dimensões. Apps usam o bitmap
para uploadar via `core.writeTexture(spec, bitmap, layout, size)`.

## Properties

### bitmap

> `readonly` **bitmap**: `ImageBitmap`

Defined in: [presentation/assets/TextureLoader.ts:11](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/TextureLoader.ts#L11)

ImageBitmap (decodificado pelo browser).

***

### height

> `readonly` **height**: `number`

Defined in: [presentation/assets/TextureLoader.ts:9](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/TextureLoader.ts#L9)

Altura em pixels.

***

### width

> `readonly` **width**: `number`

Defined in: [presentation/assets/TextureLoader.ts:7](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/TextureLoader.ts#L7)

Largura em pixels.
