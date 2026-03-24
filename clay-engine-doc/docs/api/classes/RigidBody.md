# Class: RigidBody

Defined in: [elements/physics/RigidBody.ts:20](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/RigidBody.ts#L20)

Convenência pré-configurada do PhysicsBody para dinâmica rígida.
Define as propriedades padrão via Property Bag — qualquer solver
pode ler 'mass', 'velocity', 'isKinematic' sem acoplamento a esta classe.

## Extends

- [`PhysicsBody`](PhysicsBody.md)

## Constructors

### Constructor

> **new RigidBody**(`options?`): `RigidBody`

Defined in: [elements/physics/RigidBody.ts:26](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/RigidBody.ts#L26)

#### Parameters

##### options?

[`RigidBodyOptions`](../interfaces/RigidBodyOptions.md) = `{}`

#### Returns

`RigidBody`

#### Overrides

[`PhysicsBody`](PhysicsBody.md).[`constructor`](PhysicsBody.md#constructor)

## Properties

### layer

> `readonly` **layer**: [`PHYSICS_MECHANIC`](../enumerations/ResourceType.md#physics_mechanic)

Defined in: [scene/components/physics/PhysicsBody.ts:36](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/components/physics/PhysicsBody.ts#L36)

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`layer`](PhysicsBody.md#layer)

***

### physicType

> `readonly` **physicType**: `"RigidBody"` = `'RigidBody'`

Defined in: [elements/physics/RigidBody.ts:22](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/RigidBody.ts#L22)

#### Overrides

[`PhysicsBody`](PhysicsBody.md).[`physicType`](PhysicsBody.md#physictype)

***

### state

> **state**: [`ResourceState`](../enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [scene/components/physics/PhysicsBody.ts:38](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/components/physics/PhysicsBody.ts#L38)

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`state`](PhysicsBody.md#state)

***

### storageBufferId?

> `optional` **storageBufferId?**: `string`

Defined in: [elements/physics/RigidBody.ts:24](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/RigidBody.ts#L24)

***

### type

> `readonly` **type**: `"RigidBody"` = `'RigidBody'`

Defined in: [elements/physics/RigidBody.ts:21](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/RigidBody.ts#L21)

#### Overrides

[`PhysicsBody`](PhysicsBody.md).[`type`](PhysicsBody.md#type)

***

### uuid

> `readonly` **uuid**: `string`

Defined in: [scene/components/physics/PhysicsBody.ts:31](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/components/physics/PhysicsBody.ts#L31)

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`uuid`](PhysicsBody.md#uuid)

## Accessors

### isKinematic

#### Get Signature

> **get** **isKinematic**(): `boolean`

Defined in: [elements/physics/RigidBody.ts:46](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/RigidBody.ts#L46)

##### Returns

`boolean`

***

### mass

#### Get Signature

> **get** **mass**(): `number`

Defined in: [elements/physics/RigidBody.ts:42](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/RigidBody.ts#L42)

##### Returns

`number`

#### Set Signature

> **set** **mass**(`v`): `void`

Defined in: [elements/physics/RigidBody.ts:43](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/RigidBody.ts#L43)

##### Parameters

###### v

`number`

##### Returns

`void`

***

### velocity

#### Get Signature

> **get** **velocity**(): `vec3`

Defined in: [elements/physics/RigidBody.ts:45](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/RigidBody.ts#L45)

##### Returns

`vec3`

## Methods

### allocateResource()

> **allocateResource**(`resourceManager`): `Promise`\<`void`\>

Defined in: [scene/components/physics/PhysicsBody.ts:75](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/components/physics/PhysicsBody.ts#L75)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`allocateResource`](PhysicsBody.md#allocateresource)

***

### disposeResource()

> **disposeResource**(`resourceManager`): `void`

Defined in: [scene/components/physics/PhysicsBody.ts:87](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/components/physics/PhysicsBody.ts#L87)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`void`

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`disposeResource`](PhysicsBody.md#disposeresource)

***

### doAllocate()

> `protected` **doAllocate**(`_resourceManager`): `Promise`\<`void`\>

Defined in: [elements/physics/RigidBody.ts:48](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/RigidBody.ts#L48)

#### Parameters

##### \_resourceManager

`ResourceManager`

#### Returns

`Promise`\<`void`\>

#### Overrides

[`PhysicsBody`](PhysicsBody.md).[`doAllocate`](PhysicsBody.md#doallocate)

***

### doDispose()

> `protected` **doDispose**(`resourceManager`): `void`

Defined in: [elements/physics/RigidBody.ts:52](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/RigidBody.ts#L52)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`void`

#### Overrides

[`PhysicsBody`](PhysicsBody.md).[`doDispose`](PhysicsBody.md#dodispose)

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

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`get`](PhysicsBody.md#get)

***

### has()

> **has**(`key`): `boolean`

Defined in: [scene/components/physics/PhysicsBody.ts:60](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/components/physics/PhysicsBody.ts#L60)

#### Parameters

##### key

`string`

#### Returns

`boolean`

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`has`](PhysicsBody.md#has)

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

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`set`](PhysicsBody.md#set)

***

### updateResource()

> **updateResource**(`_resourceManager`): `void`

Defined in: [scene/components/physics/PhysicsBody.ts:82](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/components/physics/PhysicsBody.ts#L82)

#### Parameters

##### \_resourceManager

`ResourceManager`

#### Returns

`void`

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`updateResource`](PhysicsBody.md#updateresource)
