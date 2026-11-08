[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / LightData

# Interface: LightData

Defined in: [src/elements/scene/Light.ts:10](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Light.ts#L10)

Dado de uma luz (layout de `Light.schema`, comum a todos os tipos).

## Properties

### castShadow

> **castShadow**: `number`

Defined in: [src/elements/scene/Light.ts:14](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Light.ts#L14)

Projeta sombra (1/0 no layout; booleano nos valores).

***

### color

> **color**: `number`[]

Defined in: [src/elements/scene/Light.ts:24](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Light.ts#L24)

Cor RGBA linear.

***

### cones

> **cones**: `number`[]

Defined in: [src/elements/scene/Light.ts:29](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Light.ts#L29)

Cones da spot em radianos (`[interno, externo, 0, 0]`); na direcional, `[0, 0, raio angular do disco, 0]` (o sol:
0,00466 rad); zeros nas outras.

***

### direction

> **direction**: `number`[]

Defined in: [src/elements/scene/Light.ts:22](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Light.ts#L22)

Direção.

***

### intensity

> **intensity**: `number`

Defined in: [src/elements/scene/Light.ts:16](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Light.ts#L16)

Intensidade: lux na direcional; candela na pontual e na spot (spec 011).

***

### kind

> **kind**: `number`

Defined in: [src/elements/scene/Light.ts:12](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Light.ts#L12)

Tipo (código numérico do layout).

***

### position

> **position**: `number`[]

Defined in: [src/elements/scene/Light.ts:20](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Light.ts#L20)

Posição.

***

### range

> **range**: `number`

Defined in: [src/elements/scene/Light.ts:18](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Light.ts#L18)

Alcance (pontual e spot): a luz vai a zero suavemente até ele; 0 = sem alcance.
