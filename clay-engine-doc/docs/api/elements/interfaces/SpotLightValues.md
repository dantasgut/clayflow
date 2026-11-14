[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / SpotLightValues

# Interface: SpotLightValues

Defined in: [src/elements/scene/SpotLight.ts:6](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/SpotLight.ts#L6)

Valores de uma `SpotLight`: os de uma luz e os cones.

## Extends

- [`LightValues`](LightValues.md)

## Properties

### castShadow?

> `optional` **castShadow?**: `boolean`

Defined in: [src/elements/scene/Light.ts:35](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Light.ts#L35)

Projeta sombra (1/0 no layout; booleano nos valores).

#### Inherited from

[`LightValues`](LightValues.md).[`castShadow`](LightValues.md#castshadow)

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

### innerCone?

> `readonly` `optional` **innerCone?**: `number`

Defined in: [src/elements/scene/SpotLight.ts:8](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/SpotLight.ts#L8)

Meio-ângulo do cone interno em radianos (intensidade plena dentro dele). Default π/8.

***

### intensity?

> `optional` **intensity?**: `number`

Defined in: [src/elements/scene/Light.ts:16](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Light.ts#L16)

Intensidade: lux na direcional; candela na pontual e na spot (spec 011).

#### Inherited from

[`LightData`](LightData.md).[`intensity`](LightData.md#intensity)

***

### outerCone?

> `readonly` `optional` **outerCone?**: `number`

Defined in: [src/elements/scene/SpotLight.ts:10](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/SpotLight.ts#L10)

Meio-ângulo do cone externo em radianos (zero fora dele; transição suave entre os dois). Default π/6.

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
