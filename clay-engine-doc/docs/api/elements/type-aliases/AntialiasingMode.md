[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / AntialiasingMode

# Type Alias: AntialiasingMode

> **AntialiasingMode** = `"off"` \| `"temporal"` \| `"msaa"` \| `"accumulate"`

Defined in: [src/elements/scene/TemporalAntialiasing.ts:15](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/TemporalAntialiasing.ts#L15)

Modo do antisserrilhado: `temporal` (amostra deslocada dentro do pixel a cada quadro, histórico reprojetado com
rejeição), `accumulate` (média uniforme de todos os quadros desde o último corte, sem rejeição — imagem parada de
referência ou captura de alta qualidade), `msaa` (4 amostras por pixel nas bordas da geometria) ou `off`.
