# Abstract Class: PhysicsBody

Defined in: [scene/components/physics/PhysicsBody.ts:34](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L34)

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
- [`FEMBody`](FEMBody.md)
- [`MPMBody`](MPMBody.md)
- [`PBFBody`](PBFBody.md)
- [`SPHBody`](SPHBody.md)

## Implements

- [`Resource`](../interfaces/Resource.md)
- [`Physic`](../interfaces/Physic.md)
- `PhysicsResource`

## Constructors

### Constructor

> **new PhysicsBody**(): `PhysicsBody`

Defined in: [scene/components/physics/PhysicsBody.ts:89](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L89)

#### Returns

`PhysicsBody`

## Properties

### bodyState

> **bodyState**: [`PhysicsBodyState`](../enumerations/PhysicsBodyState.md) = `PhysicsBodyState.Inactive`

Defined in: [scene/components/physics/PhysicsBody.ts:46](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L46)

Estado de simulação do corpo no mundo físico.

***

### dirtyFlags

> **dirtyFlags**: `number` = `PhysicsDirtyFlag.None`

Defined in: [scene/components/physics/PhysicsBody.ts:49](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L49)

Bitmask de PhysicsDirtyFlag — indica quais aspectos físicos mudaram.

#### Implementation of

`PhysicsResource.dirtyFlags`

***

### layer

> `readonly` **layer**: [`PHYSICS_MECHANIC`](../enumerations/ResourceType.md#physics_mechanic)

Defined in: [scene/components/physics/PhysicsBody.ts:41](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L41)

#### Implementation of

[`Physic`](../interfaces/Physic.md).[`layer`](../interfaces/Physic.md#layer)

***

### physicType

> `abstract` `readonly` **physicType**: `string`

Defined in: [scene/components/physics/PhysicsBody.ts:39](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L39)

#### Implementation of

[`Physic`](../interfaces/Physic.md).[`physicType`](../interfaces/Physic.md#physictype)

***

### state

> **state**: [`ResourceState`](../enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [scene/components/physics/PhysicsBody.ts:43](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L43)

#### Implementation of

[`Resource`](../interfaces/Resource.md).[`state`](../interfaces/Resource.md#state)

***

### type

> `abstract` `readonly` **type**: `string`

Defined in: [scene/components/physics/PhysicsBody.ts:38](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L38)

#### Implementation of

[`Resource`](../interfaces/Resource.md).[`type`](../interfaces/Resource.md#type)

***

### uuid

> `readonly` **uuid**: `string`

Defined in: [scene/components/physics/PhysicsBody.ts:36](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L36)

#### Implementation of

[`Resource`](../interfaces/Resource.md).[`uuid`](../interfaces/Resource.md#uuid)

## Accessors

### currentState

#### Get Signature

> **get** **currentState**(): `BodyStateHandler`

Defined in: [scene/components/physics/PhysicsBody.ts:56](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L56)

Handler do estado atual — consulta de capacidades pelos stages.

##### Returns

`BodyStateHandler`

***

### isSleeping

#### Get Signature

> **get** **isSleeping**(): `boolean`

Defined in: [scene/components/physics/PhysicsBody.ts:82](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L82)

Atalho de compatibilidade — equivale a `bodyState === Sleeping`.
Substitui `body.get<boolean>('isSleeping')` nos stages migrados.

##### Returns

`boolean`

## Methods

### allocateResource()

> **allocateResource**(`resourceManager`): `Promise`\<`void`\>

Defined in: [scene/components/physics/PhysicsBody.ts:129](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L129)

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

Defined in: [scene/components/physics/PhysicsBody.ts:141](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L141)

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

Defined in: [scene/components/physics/PhysicsBody.ts:122](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L122)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`Promise`\<`void`\>

***

### doDispose()

> `abstract` `protected` **doDispose**(`resourceManager`): `void`

Defined in: [scene/components/physics/PhysicsBody.ts:123](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L123)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`void`

***

### get()

> **get**\<`T`\>(`key`): `T` \| `undefined`

Defined in: [scene/components/physics/PhysicsBody.ts:102](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L102)

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

Defined in: [scene/components/physics/PhysicsBody.ts:106](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L106)

#### Parameters

##### key

`string`

#### Returns

`boolean`

***

### registerInWorld()

> **registerInWorld**(`_world`): `void`

Defined in: [scene/components/physics/PhysicsBody.ts:114](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L114)

Registra este componente no mundo físico.

#### Parameters

##### \_world

`unknown`

#### Returns

`void`

#### Implementation of

`PhysicsResource.registerInWorld`

***

### set()

> **set**\<`T`\>(`key`, `value`): `this`

Defined in: [scene/components/physics/PhysicsBody.ts:97](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L97)

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

### transitionTo()

> **transitionTo**(`next`): `void`

Defined in: [scene/components/physics/PhysicsBody.ts:64](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L64)

Transita para um novo estado de simulação.
Em modo DEV emite warning se a transição não for válida.

#### Parameters

##### next

[`PhysicsBodyState`](../enumerations/PhysicsBodyState.md)

#### Returns

`void`

***

### unregisterFromWorld()

> **unregisterFromWorld**(`_world`): `void`

Defined in: [scene/components/physics/PhysicsBody.ts:116](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L116)

Remove este componente do mundo físico.

#### Parameters

##### \_world

`unknown`

#### Returns

`void`

#### Implementation of

`PhysicsResource.unregisterFromWorld`

***

### updateInWorld()

> **updateInWorld**(`_world`): `void`

Defined in: [scene/components/physics/PhysicsBody.ts:115](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L115)

Atualiza aspectos dirty no mundo físico.

#### Parameters

##### \_world

`unknown`

#### Returns

`void`

#### Implementation of

`PhysicsResource.updateInWorld`

***

### updateResource()

> **updateResource**(`_resourceManager`): `void`

Defined in: [scene/components/physics/PhysicsBody.ts:136](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L136)

#### Parameters

##### \_resourceManager

`ResourceManager`

#### Returns

`void`

#### Implementation of

[`Resource`](../interfaces/Resource.md).[`updateResource`](../interfaces/Resource.md#updateresource)
