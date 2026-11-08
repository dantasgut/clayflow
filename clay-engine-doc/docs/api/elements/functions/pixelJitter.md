[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / pixelJitter

# Function: pixelJitter()

> **pixelJitter**(`frame`, `sequence`): readonly \[`number`, `number`\]

Defined in: [src/elements/scene/TemporalAntialiasing.ts:79](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/TemporalAntialiasing.ts#L79)

Deslocamento da amostra dentro do pixel no quadro `frame` (spec 034, R3): Halton (2, 3) a partir do índice 1, em
pixels, centrado (cada eixo em [−½, ½)).

## Parameters

### frame

`number`

### sequence

`number`

## Returns

readonly \[`number`, `number`\]
