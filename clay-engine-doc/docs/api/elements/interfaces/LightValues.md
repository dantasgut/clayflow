[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / LightValues

# Interface: LightValues

Defined in: [elements/scene/Light.ts:28](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/scene/Light.ts#L28)

Valores do construtor das luzes: os campos do dado exceto `kind`, com `castShadow` booleano.

## Extends

- `Partial`\<`Omit`\<[`LightData`](LightData.md), `"kind"` \| `"castShadow"`\>\>

## Properties

### castShadow?

> `optional` **castShadow?**: `boolean`

Defined in: [elements/scene/Light.ts:30](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/scene/Light.ts#L30)

Projeta sombra (1/0 no layout; booleano nos valores).

***

### color?

> `optional` **color?**: `number`[]

Defined in: [elements/scene/Light.ts:24](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/scene/Light.ts#L24)

Cor RGBA linear.

#### Inherited from

[`LightData`](LightData.md).[`color`](LightData.md#color)

***

### direction?

> `optional` **direction?**: `number`[]

Defined in: [elements/scene/Light.ts:22](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/scene/Light.ts#L22)

Direção.

#### Inherited from

[`LightData`](LightData.md).[`direction`](LightData.md#direction)

***

### intensity?

> `optional` **intensity?**: `number`

Defined in: [elements/scene/Light.ts:16](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/scene/Light.ts#L16)

Intensidade.

#### Inherited from

[`LightData`](LightData.md).[`intensity`](LightData.md#intensity)

***

### position?

> `optional` **position?**: `number`[]

Defined in: [elements/scene/Light.ts:20](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/scene/Light.ts#L20)

Posição.

#### Inherited from

[`LightData`](LightData.md).[`position`](LightData.md#position)

***

### range?

> `optional` **range?**: `number`

Defined in: [elements/scene/Light.ts:18](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/scene/Light.ts#L18)

Alcance (luzes pontuais).

#### Inherited from

[`LightData`](LightData.md).[`range`](LightData.md#range)
