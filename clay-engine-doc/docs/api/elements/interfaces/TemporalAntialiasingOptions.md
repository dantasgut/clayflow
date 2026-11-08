[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / TemporalAntialiasingOptions

# Interface: TemporalAntialiasingOptions

Defined in: [src/elements/scene/TemporalAntialiasing.ts:37](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/TemporalAntialiasing.ts#L37)

Opções de `TemporalAntialiasing`.

## Properties

### historyPrecision?

> `readonly` `optional` **historyPrecision?**: `HistoryPrecision`

Defined in: [src/elements/scene/TemporalAntialiasing.ts:47](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/TemporalAntialiasing.ts#L47)

Precisão do histórico de cor. Padrão `'full'` (spec 037, R6: o erro de 16 bits aparece na imagem parada — medido no
smoke `antialiasing`, sem custo mensurável no M4). `'full'` exige a feature `float32-filterable` (o histórico é lido
filtrado); sem ela, o histórico fica em `'half'` com aviso.

***

### mode?

> `readonly` `optional` **mode?**: [`AntialiasingMode`](../type-aliases/AntialiasingMode.md)

Defined in: [src/elements/scene/TemporalAntialiasing.ts:39](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/TemporalAntialiasing.ts#L39)

Modo. Padrão `'temporal'`.

***

### sequence?

> `readonly` `optional` **sequence?**: `number`

Defined in: [src/elements/scene/TemporalAntialiasing.ts:41](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/TemporalAntialiasing.ts#L41)

Posições da sequência de Halton (2, 3) antes de repetir. Padrão 64 (a memória do que está parado cobre a sequência inteira; `accumulate` usa até 1024).
