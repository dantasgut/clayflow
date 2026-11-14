[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / LoadedFont

# Interface: LoadedFont

Defined in: [src/presentation/ui/font.ts:24](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/ui/font.ts#L24)

Font carregada (o `FontLoader` do `clayflow/web` a gera; spec 038: o núcleo só recebe os pixels do atlas e as métricas).
`atlas` é null onde o ambiente não rasteriza texto.

## Properties

### atlas

> `readonly` **atlas**: `Uint8Array`\<`ArrayBufferLike`\> \| `null`

Defined in: [src/presentation/ui/font.ts:30](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/ui/font.ts#L30)

Os pixels do atlas com todos os glyphs (RGBA, 8 bits por canal, linha a linha).

***

### atlasHeight

> `readonly` **atlasHeight**: `number`

Defined in: [src/presentation/ui/font.ts:34](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/ui/font.ts#L34)

Altura do atlas em pixels.

***

### atlasWidth

> `readonly` **atlasWidth**: `number`

Defined in: [src/presentation/ui/font.ts:32](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/ui/font.ts#L32)

Largura do atlas em pixels.

***

### family

> `readonly` **family**: `string`

Defined in: [src/presentation/ui/font.ts:26](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/ui/font.ts#L26)

Nome da font family (e.g. 'Inter', 'monospace').

***

### fontSize

> `readonly` **fontSize**: `number`

Defined in: [src/presentation/ui/font.ts:38](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/ui/font.ts#L38)

Pixel size usado para renderizar o atlas.

***

### glyphs

> `readonly` **glyphs**: `ReadonlyMap`\<`string`, [`FontGlyph`](FontGlyph.md)\>

Defined in: [src/presentation/ui/font.ts:36](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/ui/font.ts#L36)

Map char → glyph metadata (UV + advance).

***

### url

> `readonly` **url**: `string`

Defined in: [src/presentation/ui/font.ts:28](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/ui/font.ts#L28)

URL do arquivo .woff/.ttf/.otf.
