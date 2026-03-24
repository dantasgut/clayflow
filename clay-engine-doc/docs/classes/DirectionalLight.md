# Class: DirectionalLight

Defined in: [scene/lights/Light.ts:36](https://github.com/dantasgut/clayflow/blob/65554994d1b604a896571b1ce5763d12e7f64783/src/scene/lights/Light.ts#L36)

Componente de Iluminação. (Camada 2 - Representação - ECS Puro)
Contém a cor e a intensidade. Sua posição/direção será lida do Transform da Entidade à qual está anexado.

## Extends

- [`Light`](Light.md)

## Constructors

### Constructor

> **new DirectionalLight**(`color?`, `intensity?`): `DirectionalLight`

Defined in: [scene/lights/Light.ts:40](https://github.com/dantasgut/clayflow/blob/65554994d1b604a896571b1ce5763d12e7f64783/src/scene/lights/Light.ts#L40)

#### Parameters

##### color?

\[`number`, `number`, `number`\] = `...`

##### intensity?

`number` = `1.0`

#### Returns

`DirectionalLight`

#### Overrides

[`Light`](Light.md).[`constructor`](Light.md#constructor)

## Properties

### color

> **color**: `vec3`

Defined in: [scene/lights/Light.ts:20](https://github.com/dantasgut/clayflow/blob/65554994d1b604a896571b1ce5763d12e7f64783/src/scene/lights/Light.ts#L20)

#### Inherited from

[`Light`](Light.md).[`color`](Light.md#color)

***

### direction

> **direction**: `vec3`

Defined in: [scene/lights/Light.ts:38](https://github.com/dantasgut/clayflow/blob/65554994d1b604a896571b1ce5763d12e7f64783/src/scene/lights/Light.ts#L38)

Direção normalizada para a qual a luz aponta (espaço mundo). Padrão: levemente à direita e acima.

***

### intensity

> **intensity**: `number`

Defined in: [scene/lights/Light.ts:21](https://github.com/dantasgut/clayflow/blob/65554994d1b604a896571b1ce5763d12e7f64783/src/scene/lights/Light.ts#L21)

#### Inherited from

[`Light`](Light.md).[`intensity`](Light.md#intensity)

***

### layer

> `readonly` **layer**: [`VISUAL_COMPONENT`](../enumerations/ResourceType.md#visual_component) = `ResourceType.VISUAL_COMPONENT`

Defined in: [scene/lights/Light.ts:16](https://github.com/dantasgut/clayflow/blob/65554994d1b604a896571b1ce5763d12e7f64783/src/scene/lights/Light.ts#L16)

#### Inherited from

[`Light`](Light.md).[`layer`](Light.md#layer)

***

### lightType

> **lightType**: `LightType`

Defined in: [scene/lights/Light.ts:18](https://github.com/dantasgut/clayflow/blob/65554994d1b604a896571b1ce5763d12e7f64783/src/scene/lights/Light.ts#L18)

#### Inherited from

[`Light`](Light.md).[`lightType`](Light.md#lighttype)

***

### type

> `readonly` **type**: `string` = `'Light'`

Defined in: [scene/lights/Light.ts:17](https://github.com/dantasgut/clayflow/blob/65554994d1b604a896571b1ce5763d12e7f64783/src/scene/lights/Light.ts#L17)

#### Inherited from

[`Light`](Light.md).[`type`](Light.md#type)
