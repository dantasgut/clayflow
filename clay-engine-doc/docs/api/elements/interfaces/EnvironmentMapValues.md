[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / EnvironmentMapValues

# Interface: EnvironmentMapValues

Defined in: [src/elements/scene/environment/EnvironmentMap.ts:11](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/environment/EnvironmentMap.ts#L11)

Valores de um `EnvironmentMap`.

## Properties

### background?

> `readonly` `optional` **background?**: `boolean`

Defined in: [src/elements/scene/environment/EnvironmentMap.ts:26](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/environment/EnvironmentMap.ts#L26)

A imagem é também o fundo visível. Default `true`.

***

### height

> `readonly` **height**: `number`

Defined in: [src/elements/scene/environment/EnvironmentMap.ts:15](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/environment/EnvironmentMap.ts#L15)

Altura da imagem (pixels).

***

### intensity?

> `readonly` `optional` **intensity?**: `number`

Defined in: [src/elements/scene/environment/EnvironmentMap.ts:22](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/environment/EnvironmentMap.ts#L22)

Multiplica a radiância (a escala da imagem na da cena: com o sol a 100 000 lux, um HDR de céu em nits). Default 1.

***

### pixels

> `readonly` **pixels**: `Float32Array`

Defined in: [src/elements/scene/environment/EnvironmentMap.ts:20](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/environment/EnvironmentMap.ts#L20)

A radiância linear por pixel, RGBA em ordem de linhas (a primeira linha é o topo, o zênite), `width × height × 4`
valores — o que a aplicação decodificou do arquivo (HDR, PNG…): o motor não lê arquivos.

***

### width

> `readonly` **width**: `number`

Defined in: [src/elements/scene/environment/EnvironmentMap.ts:13](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/environment/EnvironmentMap.ts#L13)

Largura da imagem equirretangular (pixels; o dobro da altura numa panorâmica completa).

***

### yaw?

> `readonly` `optional` **yaw?**: `number`

Defined in: [src/elements/scene/environment/EnvironmentMap.ts:24](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/environment/EnvironmentMap.ts#L24)

Giro da imagem em volta do eixo vertical (rad). Default 0.
