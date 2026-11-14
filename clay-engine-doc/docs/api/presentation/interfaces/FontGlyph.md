[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / FontGlyph

# Interface: FontGlyph

Defined in: [src/presentation/ui/font.ts:5](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/ui/font.ts#L5)

Posição e dimensões de um glyph dentro do atlas. UIFlow usa estes
valores para gerar UV coordinates dos quads texturados.

## Properties

### advance

> `readonly` **advance**: `number`

Defined in: [src/presentation/ui/font.ts:17](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/ui/font.ts#L17)

Quanto avançar o cursor para o próximo glyph (kerning simplificado).

***

### char

> `readonly` **char**: `string`

Defined in: [src/presentation/ui/font.ts:7](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/ui/font.ts#L7)

Caractere representado (e.g. 'A').

***

### height

> `readonly` **height**: `number`

Defined in: [src/presentation/ui/font.ts:15](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/ui/font.ts#L15)

Altura do glyph (geralmente igual ao fontSize).

***

### width

> `readonly` **width**: `number`

Defined in: [src/presentation/ui/font.ts:13](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/ui/font.ts#L13)

Largura visual do glyph (em pixels).

***

### x

> `readonly` **x**: `number`

Defined in: [src/presentation/ui/font.ts:9](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/ui/font.ts#L9)

X do canto superior esquerdo no atlas (pixels).

***

### y

> `readonly` **y**: `number`

Defined in: [src/presentation/ui/font.ts:11](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/ui/font.ts#L11)

Y do canto superior esquerdo no atlas.
