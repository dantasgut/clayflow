[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / LoadedTexture

# Interface: LoadedTexture

Defined in: [src/platform/web/assets/TextureLoader.ts:5](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/assets/TextureLoader.ts#L5)

Texture asset carregada — bitmap + dimensões. Apps usam o bitmap
para uploadar via `core.writeTexture(spec, bitmap, layout, size)`.

## Properties

### bitmap

> `readonly` **bitmap**: `ImageBitmap`

Defined in: [src/platform/web/assets/TextureLoader.ts:11](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/assets/TextureLoader.ts#L11)

ImageBitmap (decodificado pelo browser).

***

### height

> `readonly` **height**: `number`

Defined in: [src/platform/web/assets/TextureLoader.ts:9](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/assets/TextureLoader.ts#L9)

Altura em pixels.

***

### width

> `readonly` **width**: `number`

Defined in: [src/platform/web/assets/TextureLoader.ts:7](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/assets/TextureLoader.ts#L7)

Largura em pixels.
