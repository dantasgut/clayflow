[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / TemporalFilterValues

# Interface: TemporalFilterValues

Defined in: [src/elements/lighting/temporal/TemporalFilter.ts:28](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/temporal/TemporalFilter.ts#L28)

Valores de um `TemporalFilter`.

## Properties

### enabled?

> `readonly` `optional` **enabled?**: `boolean`

Defined in: [src/elements/lighting/temporal/TemporalFilter.ts:30](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/temporal/TemporalFilter.ts#L30)

Liga o filtro. Default `true`; desligado, quem compõe usa a amostra crua.

***

### historyPrecision?

> `readonly` `optional` **historyPrecision?**: `HistoryPrecision`

Defined in: [src/elements/lighting/temporal/TemporalFilter.ts:37](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/temporal/TemporalFilter.ts#L37)

Precisão dos alvos do filtro (a média, os momentos, o histórico e a saída). Default `'half'`.

***

### maxHistory?

> `readonly` `optional` **maxHistory?**: `number`

Defined in: [src/elements/lighting/temporal/TemporalFilter.ts:35](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/temporal/TemporalFilter.ts#L35)

Quadros, no máximo, da média temporal (o peso mínimo da amostra nova é 1/quadros), em 1–256. Default 32. Mais
quadros: menos ruído parado, mais tempo para seguir uma luz que muda devagar (a mudança brusca o gradiente pega).
