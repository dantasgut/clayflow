# Class: AmbientLight

Defined in: [scene/lights/Light.ts:30](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/lights/Light.ts#L30)

Componente de Iluminação. (Camada 2 - Representação - ECS Puro)
Contém a cor e a intensidade. Sua posição/direção será lida do Transform da Entidade à qual está anexado.

## Extends

- [`Light`](Light.md)

## Constructors

### Constructor

> **new AmbientLight**(`color?`, `intensity?`): `AmbientLight`

Defined in: [scene/lights/Light.ts:31](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/lights/Light.ts#L31)

#### Parameters

##### color?

\[`number`, `number`, `number`\] = `...`

##### intensity?

`number` = `1.0`

#### Returns

`AmbientLight`

#### Overrides

[`Light`](Light.md).[`constructor`](Light.md#constructor)

## Properties

### color

> **color**: `vec3`

Defined in: [scene/lights/Light.ts:20](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/lights/Light.ts#L20)

#### Inherited from

[`Light`](Light.md).[`color`](Light.md#color)

***

### intensity

> **intensity**: `number`

Defined in: [scene/lights/Light.ts:21](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/lights/Light.ts#L21)

#### Inherited from

[`Light`](Light.md).[`intensity`](Light.md#intensity)

***

### layer

> `readonly` **layer**: [`VISUAL_COMPONENT`](../enumerations/ResourceType.md#visual_component) = `ResourceType.VISUAL_COMPONENT`

Defined in: [scene/lights/Light.ts:16](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/lights/Light.ts#L16)

#### Inherited from

[`Light`](Light.md).[`layer`](Light.md#layer)

***

### lightType

> **lightType**: `LightType`

Defined in: [scene/lights/Light.ts:18](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/lights/Light.ts#L18)

#### Inherited from

[`Light`](Light.md).[`lightType`](Light.md#lighttype)

***

### type

> `readonly` **type**: `string` = `'Light'`

Defined in: [scene/lights/Light.ts:17](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/lights/Light.ts#L17)

#### Inherited from

[`Light`](Light.md).[`type`](Light.md#type)
