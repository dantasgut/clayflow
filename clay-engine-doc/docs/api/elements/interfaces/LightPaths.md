[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / LightPaths

# Interface: LightPaths

Defined in: [src/elements/render/Renderer.ts:110](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L110)

Caminhos de luz (como o Light Paths do Cycles): os limites por caminho traçado.

## Properties

### globalIllumination

> **globalIllumination**: `boolean`

Defined in: [src/elements/render/Renderer.ts:116](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L116)

A luz global ligada (a `GlobalIllumination` da cena roda; desligada aqui, não roda mesmo ligada nela).

***

### refraction

> **refraction**: `boolean`

Defined in: [src/elements/render/Renderer.ts:112](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L112)

A refração traçada ligada (os transmissivos mostram o que está atrás pelo traçado).

***

### transmission

> **transmission**: `number`

Defined in: [src/elements/render/Renderer.ts:114](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/render/Renderer.ts#L114)

Interfaces de transmissão cruzadas por caminho, em 1–32.
