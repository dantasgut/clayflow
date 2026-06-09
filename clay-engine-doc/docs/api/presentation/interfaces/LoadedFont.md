[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / LoadedFont

# Interface: LoadedFont

Defined in: [presentation/assets/FontLoader.ts:25](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/assets/FontLoader.ts#L25)

Font carregada pelo `FontLoader`. Inclui ImageBitmap atlas + glyph
metadata para text layout. `atlas` é null em ambientes sem
OffscreenCanvas (Node-side, alguns mobile browsers).

## Properties

### atlas

> `readonly` **atlas**: `ImageBitmap` \| `null`

Defined in: [presentation/assets/FontLoader.ts:31](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/assets/FontLoader.ts#L31)

ImageBitmap renderizado com todos os glyphs (RGBA).

***

### atlasHeight

> `readonly` **atlasHeight**: `number`

Defined in: [presentation/assets/FontLoader.ts:35](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/assets/FontLoader.ts#L35)

Altura do atlas em pixels.

***

### atlasWidth

> `readonly` **atlasWidth**: `number`

Defined in: [presentation/assets/FontLoader.ts:33](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/assets/FontLoader.ts#L33)

Largura do atlas em pixels.

***

### family

> `readonly` **family**: `string`

Defined in: [presentation/assets/FontLoader.ts:27](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/assets/FontLoader.ts#L27)

Nome da font family (e.g. 'Inter', 'monospace').

***

### fontSize

> `readonly` **fontSize**: `number`

Defined in: [presentation/assets/FontLoader.ts:39](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/assets/FontLoader.ts#L39)

Pixel size usado para renderizar o atlas.

***

### glyphs

> `readonly` **glyphs**: `ReadonlyMap`\<`string`, `FontGlyph`\>

Defined in: [presentation/assets/FontLoader.ts:37](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/assets/FontLoader.ts#L37)

Map char → glyph metadata (UV + advance).

***

### url

> `readonly` **url**: `string`

Defined in: [presentation/assets/FontLoader.ts:29](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/assets/FontLoader.ts#L29)

URL do arquivo .woff/.ttf/.otf.
