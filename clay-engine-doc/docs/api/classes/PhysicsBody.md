# Abstract Class: PhysicsBody

Defined in: [scene/components/physics/PhysicsBody.ts:29](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/components/physics/PhysicsBody.ts#L29)

Base abstrata para todos os corpos físicos.
Combina dois padrões:

Template Method — ciclo de vida GPU (allocate/dispose) selado na base.
Property Bag — propriedades físicas abertas via get/set tipados.

O Property Bag permite que o mesmo corpo represente um RigidBody
convencional (mass, velocity), uma partícula carregada (charge, spin),
ou qualquer entidade de um espaço físico abstrato, sem subclasses
específicas para cada configuração.

## Example

```ts
// Corpo genérico para simulação eletromagnética
const particle = new Particle();  // subclasse mínima
particle.set('mass', 9.11e-31)   // massa do elétron
        .set('charge', -1.6e-19)  // carga
        .set('velocity', vec3.create());

// Força de Lorentz lê as propriedades sem saber o tipo do corpo
const q = body.get<number>('charge') ?? 0;
```

## Extended by

- [`RigidBody`](RigidBody.md)
- [`SoftBody`](SoftBody.md)

## Implements

- [`Resource`](../interfaces/Resource.md)
- [`Physic`](../interfaces/Physic.md)

## Constructors

### Constructor

> **new PhysicsBody**(): `PhysicsBody`

Defined in: [scene/components/physics/PhysicsBody.ts:43](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/components/physics/PhysicsBody.ts#L43)

#### Returns

`PhysicsBody`

## Properties

### layer

> `readonly` **layer**: [`PHYSICS_MECHANIC`](../enumerations/ResourceType.md#physics_mechanic)

Defined in: [scene/components/physics/PhysicsBody.ts:36](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/components/physics/PhysicsBody.ts#L36)

#### Implementation of

[`Physic`](../interfaces/Physic.md).[`layer`](../interfaces/Physic.md#layer)

***

### physicType

> `abstract` `readonly` **physicType**: `string`

Defined in: [scene/components/physics/PhysicsBody.ts:34](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/components/physics/PhysicsBody.ts#L34)

#### Implementation of

[`Physic`](../interfaces/Physic.md).[`physicType`](../interfaces/Physic.md#physictype)

***

### state

> **state**: [`ResourceState`](../enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [scene/components/physics/PhysicsBody.ts:38](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/components/physics/PhysicsBody.ts#L38)

#### Implementation of

[`Resource`](../interfaces/Resource.md).[`state`](../interfaces/Resource.md#state)

***

### type

> `abstract` `readonly` **type**: `string`

Defined in: [scene/components/physics/PhysicsBody.ts:33](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/components/physics/PhysicsBody.ts#L33)

#### Implementation of

[`Resource`](../interfaces/Resource.md).[`type`](../interfaces/Resource.md#type)

***

### uuid

> `readonly` **uuid**: `string`

Defined in: [scene/components/physics/PhysicsBody.ts:31](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/components/physics/PhysicsBody.ts#L31)

#### Implementation of

[`Resource`](../interfaces/Resource.md).[`uuid`](../interfaces/Resource.md#uuid)

## Methods

### allocateResource()

> **allocateResource**(`resourceManager`): `Promise`\<`void`\>

Defined in: [scene/components/physics/PhysicsBody.ts:75](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/components/physics/PhysicsBody.ts#L75)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Resource`](../interfaces/Resource.md).[`allocateResource`](../interfaces/Resource.md#allocateresource)

***

### disposeResource()

> **disposeResource**(`resourceManager`): `void`

Defined in: [scene/components/physics/PhysicsBody.ts:87](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/components/physics/PhysicsBody.ts#L87)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`void`

#### Implementation of

[`Resource`](../interfaces/Resource.md).[`disposeResource`](../interfaces/Resource.md#disposeresource)

***

### doAllocate()

> `abstract` `protected` **doAllocate**(`resourceManager`): `Promise`\<`void`\>

Defined in: [scene/components/physics/PhysicsBody.ts:68](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/components/physics/PhysicsBody.ts#L68)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`Promise`\<`void`\>

***

### doDispose()

> `abstract` `protected` **doDispose**(`resourceManager`): `void`

Defined in: [scene/components/physics/PhysicsBody.ts:69](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/components/physics/PhysicsBody.ts#L69)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`void`

***

### get()

> **get**\<`T`\>(`key`): `T` \| `undefined`

Defined in: [scene/components/physics/PhysicsBody.ts:56](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/components/physics/PhysicsBody.ts#L56)

#### Type Parameters

##### T

`T`

#### Parameters

##### key

`string`

#### Returns

`T` \| `undefined`

***

### has()

> **has**(`key`): `boolean`

Defined in: [scene/components/physics/PhysicsBody.ts:60](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/components/physics/PhysicsBody.ts#L60)

#### Parameters

##### key

`string`

#### Returns

`boolean`

***

### set()

> **set**\<`T`\>(`key`, `value`): `this`

Defined in: [scene/components/physics/PhysicsBody.ts:51](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/components/physics/PhysicsBody.ts#L51)

#### Type Parameters

##### T

`T`

#### Parameters

##### key

`string`

##### value

`T`

#### Returns

`this`

***

### updateResource()

> **updateResource**(`_resourceManager`): `void`

Defined in: [scene/components/physics/PhysicsBody.ts:82](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/components/physics/PhysicsBody.ts#L82)

#### Parameters

##### \_resourceManager

`ResourceManager`

#### Returns

`void`

#### Implementation of

[`Resource`](../interfaces/Resource.md).[`updateResource`](../interfaces/Resource.md#updateresource)
