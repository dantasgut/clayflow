[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / TextureLoader

# Class: TextureLoader

Defined in: [presentation/assets/TextureLoader.ts:19](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/assets/TextureLoader.ts#L19)

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

Defined in: [presentation/assets/TextureLoader.ts:21](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/assets/TextureLoader.ts#L21)

Carrega uma textura via fetch. Lança se URL não responde ou format não suportado.

#### Parameters

##### url

`string`

#### Returns

`Promise`\<[`LoadedTexture`](../interfaces/LoadedTexture.md)\>
