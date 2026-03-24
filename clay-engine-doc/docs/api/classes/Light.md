# Class: Light

Defined in: [scene/lights/Light.ts:15](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/lights/Light.ts#L15)

Componente de Iluminação. (Camada 2 - Representação - ECS Puro)
Contém a cor e a intensidade. Sua posição/direção será lida do Transform da Entidade à qual está anexado.

## Extended by

- [`AmbientLight`](AmbientLight.md)
- [`DirectionalLight`](DirectionalLight.md)
- [`PointLight`](PointLight.md)

## Implements

- [`Component`](../interfaces/Component.md)

## Constructors

### Constructor

> **new Light**(`type`, `color?`, `intensity?`): `Light`

Defined in: [scene/lights/Light.ts:23](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/lights/Light.ts#L23)

#### Parameters

##### type

`LightType`

##### color?

\[`number`, `number`, `number`\] = `...`

##### intensity?

`number` = `1.0`

#### Returns

`Light`

## Properties

### color

> **color**: `vec3`

Defined in: [scene/lights/Light.ts:20](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/lights/Light.ts#L20)

***

### intensity

> **intensity**: `number`

Defined in: [scene/lights/Light.ts:21](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/lights/Light.ts#L21)

***

### layer

> `readonly` **layer**: [`VISUAL_COMPONENT`](../enumerations/ResourceType.md#visual_component) = `ResourceType.VISUAL_COMPONENT`

Defined in: [scene/lights/Light.ts:16](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/lights/Light.ts#L16)

#### Implementation of

[`Component`](../interfaces/Component.md).[`layer`](../interfaces/Component.md#layer)

***

### lightType

> **lightType**: `LightType`

Defined in: [scene/lights/Light.ts:18](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/lights/Light.ts#L18)

***

### type

> `readonly` **type**: `string` = `'Light'`

Defined in: [scene/lights/Light.ts:17](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/lights/Light.ts#L17)

#### Implementation of

[`Component`](../interfaces/Component.md).[`type`](../interfaces/Component.md#type)
