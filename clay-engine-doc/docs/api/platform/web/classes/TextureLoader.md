[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / TextureLoader

# Class: TextureLoader

Defined in: [src/platform/web/assets/TextureLoader.ts:19](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/assets/TextureLoader.ts#L19)

TextureLoader carrega imagens (PNG, JPG, WebP, HDR) via fetch +
`createImageBitmap`. Decodificação é assíncrona e off-main-thread
(browsers modernos).

## Constructors

### Constructor

> **new TextureLoader**(): `TextureLoader`

#### Returns

`TextureLoader`

## Methods

### load()

> **load**(`url`): `Promise`\<[`LoadedTexture`](../interfaces/LoadedTexture.md)\>

Defined in: [src/platform/web/assets/TextureLoader.ts:21](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/assets/TextureLoader.ts#L21)

Carrega uma textura via fetch. Lança se URL não responde ou format não suportado.

#### Parameters

##### url

`string`

#### Returns

`Promise`\<[`LoadedTexture`](../interfaces/LoadedTexture.md)\>
