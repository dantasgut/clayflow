[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / ShadowMapData

# Interface: ShadowMapData

Defined in: [src/elements/scene/ShadowMap.ts:43](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/ShadowMap.ts#L43)

Dado de um `ShadowMap` (layout de `ShadowMap.schema`).

## Properties

### atlasPages

> **atlasPages**: `number`

Defined in: [src/elements/scene/ShadowMap.ts:57](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/ShadowMap.ts#L57)

Páginas físicas por lado do atlas.

***

### bias

> **bias**: `number`

Defined in: [src/elements/scene/ShadowMap.ts:45](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/ShadowMap.ts#L45)

Viés de profundidade da comparação, em texels.

***

### firstLevelRadius

> **firstLevelRadius**: `number`

Defined in: [src/elements/scene/ShadowMap.ts:53](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/ShadowMap.ts#L53)

Meio lado do primeiro nível, em metros.

***

### normalBias

> **normalBias**: `number`

Defined in: [src/elements/scene/ShadowMap.ts:47](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/ShadowMap.ts#L47)

Deslocamento ao longo da normal, em texels.

***

### pagesPerLevel

> **pagesPerLevel**: `number`

Defined in: [src/elements/scene/ShadowMap.ts:55](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/ShadowMap.ts#L55)

Páginas por lado de um nível (par, 4–64): `size` / 128.

***

### penumbraSamples

> **penumbraSamples**: `number`

Defined in: [src/elements/scene/ShadowMap.ts:51](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/ShadowMap.ts#L51)

Amostras da penumbra (1, 4 ou 9).

***

### size

> **size**: readonly \[`number`, `number`\]

Defined in: [src/elements/scene/ShadowMap.ts:49](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/ShadowMap.ts#L49)

Tamanho.
