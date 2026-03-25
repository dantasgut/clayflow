# Class: ConstantForce

Defined in: [elements/physics/forces/ConstantForce.ts:9](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/elements/physics/forces/ConstantForce.ts#L9)

Força constante independente do estado do corpo.
Caso de uso principal: gravidade uniforme, vento constante.

## Implements

- [`Force`](../interfaces/Force.md)

## Constructors

### Constructor

> **new ConstantForce**(`id`, `direction`): `ConstantForce`

Defined in: [elements/physics/forces/ConstantForce.ts:13](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/elements/physics/forces/ConstantForce.ts#L13)

#### Parameters

##### id

`string`

##### direction

`vec3`

#### Returns

`ConstantForce`

## Properties

### id

> `readonly` **id**: `string`

Defined in: [elements/physics/forces/ConstantForce.ts:10](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/elements/physics/forces/ConstantForce.ts#L10)

#### Implementation of

[`Force`](../interfaces/Force.md).[`id`](../interfaces/Force.md#id)

## Methods

### compute()

> **compute**(`_body`, `_dt`): `vec3`

Defined in: [elements/physics/forces/ConstantForce.ts:18](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/elements/physics/forces/ConstantForce.ts#L18)

#### Parameters

##### \_body

[`PhysicsBody`](PhysicsBody.md)

##### \_dt

`number`

#### Returns

`vec3`

#### Implementation of

[`Force`](../interfaces/Force.md).[`compute`](../interfaces/Force.md#compute)
