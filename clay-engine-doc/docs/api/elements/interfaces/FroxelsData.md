[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / FroxelsData

# Interface: FroxelsData

Defined in: [src/elements/media/Froxels.ts:32](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/Froxels.ts#L32)

Dado dos `Froxels`: o uniform (escrito pelo estágio), a capacidade do buffer dos meios e se há névoa na cena.

## Properties

### active

> **active**: `number`

Defined in: [src/elements/media/Froxels.ts:37](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/Froxels.ts#L37)

1 com algum `FogVolume` na cena (as contribuições valem); 0 sem. Escrito só quando muda.

***

### capacity

> **capacity**: `number`

Defined in: [src/elements/media/Froxels.ts:35](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/Froxels.ts#L35)

vec4f do buffer dos meios (cabeçalho, registros e grades).

***

### grid

> **grid**: readonly \[`number`, `number`, `number`\]

Defined in: [src/elements/media/Froxels.ts:43](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/Froxels.ts#L43)

Froxels por eixo (x, y na tela, z em fatias da profundidade): o valor do perfil do `Renderer` (spec 034, T079).

***

### historyPrecision

> **historyPrecision**: `number`

Defined in: [src/elements/media/Froxels.ts:41](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/Froxels.ts#L41)

Precisão dos históricos da névoa (spec 037, R6): 0 half, 1 full.

***

### params

> **params**: \[`Record`\<`string`, `number`[]\>\]

Defined in: [src/elements/media/Froxels.ts:33](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/Froxels.ts#L33)

***

### revision

> **revision**: `number`

Defined in: [src/elements/media/Froxels.ts:39](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/Froxels.ts#L39)

Revisão da composição das funções de densidade (sobe a cada mudança do conjunto).
