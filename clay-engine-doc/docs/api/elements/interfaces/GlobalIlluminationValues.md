[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / GlobalIlluminationValues

# Interface: GlobalIlluminationValues

Defined in: [src/elements/lighting/GlobalIllumination.ts:61](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L61)

Valores de uma `GlobalIllumination`.

## Properties

### bounces?

> `readonly` `optional` **bounces?**: `number`

Defined in: [src/elements/lighting/GlobalIllumination.ts:67](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L67)

Rebatimentos da luz indireta, em 1–8. Default 3.

***

### cascades?

> `readonly` `optional` **cascades?**: `number`

Defined in: [src/elements/lighting/GlobalIllumination.ts:79](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L79)

Cascatas de sondas, em 1–4. Default 3.

***

### center?

> `readonly` `optional` **center?**: readonly `number`[]

Defined in: [src/elements/lighting/GlobalIllumination.ts:110](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L110)

Centro fixo do volume de sondas (m). Sem ele, as cascatas acompanham a câmera — o certo para cenas abertas; um
interior visto de fora (a câmera fora do volume que importa) fixa o centro nele.

***

### enabled?

> `readonly` `optional` **enabled?**: `boolean`

Defined in: [src/elements/lighting/GlobalIllumination.ts:63](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L63)

Liga a iluminação global. Default `true`.

***

### hysteresis?

> `readonly` `optional` **hysteresis?**: `number`

Defined in: [src/elements/lighting/GlobalIllumination.ts:77](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L77)

Histerese do acúmulo nas sondas, em [0,8; 0,995]. Default 0,97. É o piso: as sondas com ruído sobem pela variância
até 0,995, o bastante para o ruído da média ficar em 0,5 % (spec 034, T052); a mudança de luz cai para a de
resposta.

***

### probeFraction?

> `readonly` `optional` **probeFraction?**: `number`

Defined in: [src/elements/lighting/GlobalIllumination.ts:71](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L71)

Fração das sondas atualizadas por quadro, em (0, 1] (substitui a da qualidade).

***

### probeSpacing?

> `readonly` `optional` **probeSpacing?**: `number`

Defined in: [src/elements/lighting/GlobalIllumination.ts:87](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L87)

Espaçamento das sondas do mundo na cascata mais fina (m); as seguintes dobram. Default 1. As sondas do mundo dão a
luz rebatida fora da tela (e os rebatimentos nos pontos fora dela): paredes mais finas que cerca de metade do
espaçamento podem deixar vazar luz ali — o espaçamento da cena fica abaixo do dobro da parede mais fina que separa
luz de escuro. O ponto amostrado sai da superfície pela normal (0,1 do espaçamento) e para a câmera (0,3), contra o
vazamento nas quinas.

***

### quality?

> `readonly` `optional` **quality?**: [`GlobalIlluminationQuality`](../type-aliases/GlobalIlluminationQuality.md)

Defined in: [src/elements/lighting/GlobalIllumination.ts:65](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L65)

Qualidade (raios por sonda, fração por quadro, sondas de tela). Default `'medium'`.

***

### raysPerProbe?

> `readonly` `optional` **raysPerProbe?**: `number`

Defined in: [src/elements/lighting/GlobalIllumination.ts:69](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L69)

Raios por sonda (substitui o da qualidade): 32, 64, 128 ou 256.

***

### screenFraction?

> `readonly` `optional` **screenFraction?**: `number`

Defined in: [src/elements/lighting/GlobalIllumination.ts:105](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L105)

Fração das sondas de tela que lançam raios por quadro (substitui a da qualidade): 1, 0,5 (xadrez) ou 0,25 (2 × 2).
As outras herdam o histórico reprojetado; a recém-descoberta (sem histórico) sempre lança.

***

### screenGather?

> `readonly` `optional` **screenGather?**: `boolean`

Defined in: [src/elements/lighting/GlobalIllumination.ts:92](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L92)

Coleta final na tela (R2 adendo): sondas de tela a cada 8 × 8 pixels lançam raios das superfícies visíveis — a
luz rebatida de perto (cantos, sombras da luz rebatida) exata; as sondas do mundo dão o resto. Default `true`.

***

### screenRays?

> `readonly` `optional` **screenRays?**: `number`

Defined in: [src/elements/lighting/GlobalIllumination.ts:94](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L94)

Raios por sonda de tela por quadro (substitui o da qualidade): 4, 8, 16, 32 ou 64.

***

### screenTile?

> `readonly` `optional` **screenTile?**: `number`

Defined in: [src/elements/lighting/GlobalIllumination.ts:100](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L100)

Pixels por lado do ladrilho de uma sonda de tela num alvo de 1080 linhas (substitui o da qualidade): 4, 8 ou 16;
dobra a cada dobro da altura (8 px em 4K com o 4 da qualidade alta: a mesma resolução angular). Menor resolve a
luz de perto em faces mais estreitas na tela, com mais raios por quadro.
