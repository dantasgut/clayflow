[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / CausticsSettings

# Interface: CausticsSettings

Defined in: [src/elements/render/Renderer.ts:157](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L157)

O transporte das cáusticas: a luz que passa por vidro, água e metal liso até uma superfície difusa.

## Properties

### cellSize

> **cellSize**: `number`

Defined in: [src/elements/render/Renderer.ts:163](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L163)

Lado da célula do hash em m (> 0).

***

### enabled

> **enabled**: `boolean`

Defined in: [src/elements/render/Renderer.ts:159](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L159)

Ligado.

***

### interval

> **interval**: `number`

Defined in: [src/elements/render/Renderer.ts:165](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L165)

Quadros entre duas emissões de fótons (≥ 1; parado, a mesma imagem; em movimento, o atraso do intervalo).

***

### photons

> **photons**: `number`

Defined in: [src/elements/render/Renderer.ts:161](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L161)

Fótons por quadro (≥ 0).
