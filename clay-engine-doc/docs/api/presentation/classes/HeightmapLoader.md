[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / HeightmapLoader

# Class: HeightmapLoader

Defined in: [presentation/assets/HeightmapLoader.ts:21](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/assets/HeightmapLoader.ts#L21)

HeightmapLoader carrega imagens (PNG/JPG) e extrai o canal R como
altura normalizada. 8-bit precision (256 níveis distintos). Para
heightmaps de alta resolução use 16-bit PNG ou EXR (não-suportado
neste loader — usar TextureLoader + decode manual).

## Constructors

### Constructor

> **new HeightmapLoader**(): `HeightmapLoader`

#### Returns

`HeightmapLoader`

## Methods

### load()

> **load**(`url`): `Promise`\<[`Heightmap`](../interfaces/Heightmap.md)\>

Defined in: [presentation/assets/HeightmapLoader.ts:23](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/assets/HeightmapLoader.ts#L23)

Carrega heightmap via fetch + decode + extração canal R.

#### Parameters

##### url

`string`

#### Returns

`Promise`\<[`Heightmap`](../interfaces/Heightmap.md)\>
