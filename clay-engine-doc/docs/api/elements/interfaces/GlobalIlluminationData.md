[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / GlobalIlluminationData

# Interface: GlobalIlluminationData

Defined in: [src/elements/lighting/GlobalIllumination.ts:114](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L114)

Dado de uma `GlobalIllumination`: os parâmetros de autoria.

## Properties

### bounces

> **bounces**: `number`

Defined in: [src/elements/lighting/GlobalIllumination.ts:121](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L121)

***

### cascades

> **cascades**: `number`

Defined in: [src/elements/lighting/GlobalIllumination.ts:125](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L125)

***

### center

> **center**: `number`[]

Defined in: [src/elements/lighting/GlobalIllumination.ts:132](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L132)

Centro fixo do volume de sondas, ou vazio (as cascatas acompanham a câmera).

***

### enabled

> **enabled**: `boolean`

Defined in: [src/elements/lighting/GlobalIllumination.ts:115](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L115)

***

### hysteresis

> **hysteresis**: `number`

Defined in: [src/elements/lighting/GlobalIllumination.ts:124](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L124)

***

### lightPath

> **lightPath**: `boolean`

Defined in: [src/elements/lighting/GlobalIllumination.ts:120](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L120)

A luz global nos caminhos de luz do `Renderer` (`lightPaths.globalIllumination`): desligada lá, a GI não roda
mesmo com `enabled`. Escrito pelo renderizador; `true` sem ele.

***

### params

> **params**: \[`Record`\<`string`, `number`[]\>\]

Defined in: [src/elements/lighting/GlobalIllumination.ts:142](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L142)

O uniform, num registro (escrito pelo estágio das sondas a cada quadro: cascatas, raios, rotação) — separado dos
valores de autoria, cujos nomes não são os do layout.

***

### probeFraction

> **probeFraction**: `number`

Defined in: [src/elements/lighting/GlobalIllumination.ts:123](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L123)

***

### probeSpacing

> **probeSpacing**: `number`

Defined in: [src/elements/lighting/GlobalIllumination.ts:126](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L126)

***

### raysPerProbe

> **raysPerProbe**: `number`

Defined in: [src/elements/lighting/GlobalIllumination.ts:122](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L122)

***

### screenFraction

> **screenFraction**: `number`

Defined in: [src/elements/lighting/GlobalIllumination.ts:130](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L130)

***

### screenGather

> **screenGather**: `boolean`

Defined in: [src/elements/lighting/GlobalIllumination.ts:127](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L127)

***

### screenRays

> **screenRays**: `number`

Defined in: [src/elements/lighting/GlobalIllumination.ts:128](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L128)

***

### screenRecords

> **screenRecords**: `number`

Defined in: [src/elements/lighting/GlobalIllumination.ts:137](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L137)

vec4f de uma fatia do histórico das sondas de tela (ladrilhos × (3 + gerações)), reservados pelo estágio das
sondas para o tamanho do alvo (`reserveScreenHistory`); 1 até lá.

***

### screenTile

> **screenTile**: `number`

Defined in: [src/elements/lighting/GlobalIllumination.ts:129](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/GlobalIllumination.ts#L129)
