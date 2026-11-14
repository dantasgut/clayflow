[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / FontLoader

# Class: FontLoader

Defined in: [src/platform/web/assets/FontLoader.ts:30](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/assets/FontLoader.ts#L30)

FontLoader carrega arquivos de font (woff, ttf, otf) e gera um atlas
de glyphs (pixels RGBA). UIFlow usa o atlas + glyph metadata para
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

> **load**(`family`, `url`, `options?`): `Promise`\<[`LoadedFont`](../../../presentation/interfaces/LoadedFont.md)\>

Defined in: [src/platform/web/assets/FontLoader.ts:35](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/assets/FontLoader.ts#L35)

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

`Promise`\<[`LoadedFont`](../../../presentation/interfaces/LoadedFont.md)\>
