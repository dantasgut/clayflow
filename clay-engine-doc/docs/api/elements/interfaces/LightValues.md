[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / LightValues

# Interface: LightValues

Defined in: [src/elements/scene/Light.ts:33](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Light.ts#L33)

Valores do construtor das luzes: os campos do dado exceto `kind`, com `castShadow` booleano.

## Extends

- `Partial`\<`Omit`\<[`LightData`](LightData.md), `"kind"` \| `"castShadow"` \| `"cones"`\>\>

## Extended by

- [`SpotLightValues`](SpotLightValues.md)

## Properties

### castShadow?

> `optional` **castShadow?**: `boolean`

Defined in: [src/elements/scene/Light.ts:35](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Light.ts#L35)

Projeta sombra (1/0 no layout; booleano nos valores).

***

### color?

> `optional` **color?**: `number`[]

Defined in: [src/elements/scene/Light.ts:24](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Light.ts#L24)

Cor RGBA linear.

#### Inherited from

[`LightData`](LightData.md).[`color`](LightData.md#color)

***

### direction?

> `optional` **direction?**: `number`[]

Defined in: [src/elements/scene/Light.ts:22](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Light.ts#L22)

Direção.

#### Inherited from

[`LightData`](LightData.md).[`direction`](LightData.md#direction)

***

### intensity?

> `optional` **intensity?**: `number`

Defined in: [src/elements/scene/Light.ts:16](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Light.ts#L16)

Intensidade: lux na direcional; candela na pontual e na spot (spec 011).

#### Inherited from

[`LightData`](LightData.md).[`intensity`](LightData.md#intensity)

***

### position?

> `optional` **position?**: `number`[]

Defined in: [src/elements/scene/Light.ts:20](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Light.ts#L20)

Posição.

#### Inherited from

[`LightData`](LightData.md).[`position`](LightData.md#position)

***

### range?

> `optional` **range?**: `number`

Defined in: [src/elements/scene/Light.ts:18](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Light.ts#L18)

Alcance (pontual e spot): a luz vai a zero suavemente até ele; 0 = sem alcance.

#### Inherited from

[`LightData`](LightData.md).[`range`](LightData.md#range)
