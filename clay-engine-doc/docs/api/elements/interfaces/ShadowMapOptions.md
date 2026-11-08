[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / ShadowMapOptions

# Interface: ShadowMapOptions

Defined in: [src/elements/scene/ShadowMap.ts:11](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/ShadowMap.ts#L11)

Opções de `ShadowMap`.

## Properties

### bias?

> `readonly` `optional` **bias?**: `number`

Defined in: [src/elements/scene/ShadowMap.ts:13](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/ShadowMap.ts#L13)

Viés de profundidade da comparação (contra acne), em texels do mapa. Padrão 1.

***

### firstLevelRadius?

> `readonly` `optional` **firstLevelRadius?**: `number`

Defined in: [src/elements/scene/ShadowMap.ts:28](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/ShadowMap.ts#L28)

Meio lado, em metros, do primeiro nível (o mais fino) em volta da câmera; cada nível seguinte dobra. Padrão 1.

***

### normalBias?

> `readonly` `optional` **normalBias?**: `number`

Defined in: [src/elements/scene/ShadowMap.ts:18](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/ShadowMap.ts#L18)

Deslocamento da consulta ao longo da normal da superfície, em texels do mapa (mais quanto mais rasante a luz).
Padrão 1,5.

***

### penumbraSamples?

> `readonly` `optional` **penumbraSamples?**: `number`

Defined in: [src/elements/scene/ShadowMap.ts:33](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/ShadowMap.ts#L33)

Amostras da penumbra (o filtro da borda): 1, 4 (2 × 2) ou 9 (3 × 3). Sem ela, a do perfil do `Renderer`
(`shadows.penumbraSamples`; 9 sem renderizador).

***

### size?

> `readonly` `optional` **size?**: readonly \[`number`, `number`\]

Defined in: [src/elements/scene/ShadowMap.ts:24](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/ShadowMap.ts#L24)

Resolução virtual de cada nível do mapa em texels `[largura, altura]` (o maior lado vale; spec 034, T060: páginas de
128², em número par por lado, de 4 a 64). Sem ela, a do perfil do `Renderer` da cena (`shadows.resolution`;
`[4096, 4096]` sem renderizador).
