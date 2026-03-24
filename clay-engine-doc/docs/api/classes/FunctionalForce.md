# Class: FunctionalForce

Defined in: [elements/physics/forces/FunctionalForce.ts:9](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/forces/FunctionalForce.ts#L9)

Força definida por função arbitrária — para campos personalizados,
geometria diferencial, espaços abstratos.

## Implements

- [`Force`](../interfaces/Force.md)

## Constructors

### Constructor

> **new FunctionalForce**(`id`, `fn`): `FunctionalForce`

Defined in: [elements/physics/forces/FunctionalForce.ts:13](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/forces/FunctionalForce.ts#L13)

#### Parameters

##### id

`string`

##### fn

(`body`, `dt`) => `vec3`

#### Returns

`FunctionalForce`

## Properties

### id

> `readonly` **id**: `string`

Defined in: [elements/physics/forces/FunctionalForce.ts:10](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/forces/FunctionalForce.ts#L10)

#### Implementation of

[`Force`](../interfaces/Force.md).[`id`](../interfaces/Force.md#id)

## Methods

### compute()

> **compute**(`body`, `dt`): `vec3`

Defined in: [elements/physics/forces/FunctionalForce.ts:18](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/forces/FunctionalForce.ts#L18)

#### Parameters

##### body

[`PhysicsBody`](PhysicsBody.md)

##### dt

`number`

#### Returns

`vec3`

#### Implementation of

[`Force`](../interfaces/Force.md).[`compute`](../interfaces/Force.md#compute)
