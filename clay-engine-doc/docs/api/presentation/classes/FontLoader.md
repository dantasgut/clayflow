[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / FontLoader

# Class: FontLoader

Defined in: [presentation/assets/FontLoader.ts:69](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/assets/FontLoader.ts#L69)

FontLoader carrega arquivos de font (woff, ttf, otf) e gera um atlas
de glyphs em ImageBitmap. UIFlow usa o atlas + glyph metadata para
renderizar texto via quads texturados.

Implementação: usa FontFace API (browser) para registrar a font e
OffscreenCanvas para renderizar cada char. Fallback gracioso se APIs
não disponíveis (retorna LoadedFont com atlas=null).

## Constructors

### Constructor

> **new FontLoader**(): `FontLoader`

#### Returns

`FontLoader`

## Methods

### load()

> **load**(`family`, `url`, `options?`): `Promise`\<[`LoadedFont`](../interfaces/LoadedFont.md)\>

Defined in: [presentation/assets/FontLoader.ts:74](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/assets/FontLoader.ts#L74)

Carrega font + gera atlas. Retorna LoadedFont mesmo se renderização
falhar (atlas=null nesse caso) para que o app não quebre.

#### Parameters

##### family

`string`

##### url

`string`

##### options?

`FontLoaderOptions` = `{}`

#### Returns

`Promise`\<[`LoadedFont`](../interfaces/LoadedFont.md)\>
