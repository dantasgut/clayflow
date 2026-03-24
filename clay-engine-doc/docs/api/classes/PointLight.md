# Class: PointLight

Defined in: [scene/lights/Light.ts:45](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/lights/Light.ts#L45)

Componente de Iluminação. (Camada 2 - Representação - ECS Puro)
Contém a cor e a intensidade. Sua posição/direção será lida do Transform da Entidade à qual está anexado.

## Extends

- [`Light`](Light.md)

## Constructors

### Constructor

> **new PointLight**(`color?`, `intensity?`, `distance?`, `decay?`): `PointLight`

Defined in: [scene/lights/Light.ts:49](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/lights/Light.ts#L49)

#### Parameters

##### color?

\[`number`, `number`, `number`\] = `...`

##### intensity?

`number` = `1.0`

##### distance?

`number` = `0`

##### decay?

`number` = `2`

#### Returns

`PointLight`

#### Overrides

[`Light`](Light.md).[`constructor`](Light.md#constructor)

## Properties

### color

> **color**: `vec3`

Defined in: [scene/lights/Light.ts:20](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/lights/Light.ts#L20)

#### Inherited from

[`Light`](Light.md).[`color`](Light.md#color)

***

### decay

> **decay**: `number`

Defined in: [scene/lights/Light.ts:47](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/lights/Light.ts#L47)

***

### distance

> **distance**: `number`

Defined in: [scene/lights/Light.ts:46](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/lights/Light.ts#L46)

***

### intensity

> **intensity**: `number`

Defined in: [scene/lights/Light.ts:21](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/lights/Light.ts#L21)

#### Inherited from

[`Light`](Light.md).[`intensity`](Light.md#intensity)

***

### layer

> `readonly` **layer**: [`VISUAL_COMPONENT`](../enumerations/ResourceType.md#visual_component) = `ResourceType.VISUAL_COMPONENT`

Defined in: [scene/lights/Light.ts:16](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/lights/Light.ts#L16)

#### Inherited from

[`Light`](Light.md).[`layer`](Light.md#layer)

***

### lightType

> **lightType**: `LightType`

Defined in: [scene/lights/Light.ts:18](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/lights/Light.ts#L18)

#### Inherited from

[`Light`](Light.md).[`lightType`](Light.md#lighttype)

***

### type

> `readonly` **type**: `string` = `'Light'`

Defined in: [scene/lights/Light.ts:17](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/lights/Light.ts#L17)

#### Inherited from

[`Light`](Light.md).[`type`](Light.md#type)
