# Class: SoftBody

Defined in: [elements/physics/SoftBody.ts:61](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/SoftBody.ts#L61)

Corpo deformável — malha de partículas conectadas por constraints de distância.

Cada vértice da targetGeometry torna-se uma SoftParticle com posição,
velocidade prevista e massa inversa. Cada aresta única da malha torna-se
uma SoftConstraint com restLength = distância inicial entre os vértices.

O pipeline XPBD SoftBody opera diretamente sobre `particles` e `constraints`,
sem passar pelo sistema de RigidBody ou CollisionDispatcher.

## Extends

- [`PhysicsBody`](PhysicsBody.md)

## Constructors

### Constructor

> **new SoftBody**(`options?`): `SoftBody`

Defined in: [elements/physics/SoftBody.ts:70](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/SoftBody.ts#L70)

#### Parameters

##### options?

`SoftBodyOptions` = `{}`

#### Returns

`SoftBody`

#### Overrides

[`PhysicsBody`](PhysicsBody.md).[`constructor`](PhysicsBody.md#constructor)

## Properties

### constraints

> **constraints**: `SoftConstraint`[] = `[]`

Defined in: [elements/physics/SoftBody.ts:66](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/SoftBody.ts#L66)

***

### layer

> `readonly` **layer**: [`PHYSICS_MECHANIC`](../enumerations/ResourceType.md#physics_mechanic)

Defined in: [scene/components/physics/PhysicsBody.ts:36](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/components/physics/PhysicsBody.ts#L36)

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`layer`](PhysicsBody.md#layer)

***

### particles

> **particles**: `SoftParticle`[] = `[]`

Defined in: [elements/physics/SoftBody.ts:65](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/SoftBody.ts#L65)

***

### physicType

> `readonly` **physicType**: `"SoftBody"` = `'SoftBody'`

Defined in: [elements/physics/SoftBody.ts:63](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/SoftBody.ts#L63)

#### Overrides

[`PhysicsBody`](PhysicsBody.md).[`physicType`](PhysicsBody.md#physictype)

***

### state

> **state**: [`ResourceState`](../enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [scene/components/physics/PhysicsBody.ts:38](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/components/physics/PhysicsBody.ts#L38)

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`state`](PhysicsBody.md#state)

***

### type

> `readonly` **type**: `"SoftBody"` = `'SoftBody'`

Defined in: [elements/physics/SoftBody.ts:62](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/SoftBody.ts#L62)

#### Overrides

[`PhysicsBody`](PhysicsBody.md).[`type`](PhysicsBody.md#type)

***

### uuid

> `readonly` **uuid**: `string`

Defined in: [scene/components/physics/PhysicsBody.ts:31](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/components/physics/PhysicsBody.ts#L31)

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`uuid`](PhysicsBody.md#uuid)

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

> `protected` **doAllocate**(`resourceManager`): `Promise`\<`void`\>

Defined in: [elements/physics/SoftBody.ts:161](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/SoftBody.ts#L161)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`Promise`\<`void`\>

#### Overrides

[`PhysicsBody`](PhysicsBody.md).[`doAllocate`](PhysicsBody.md#doallocate)

***

### doDispose()

> `protected` **doDispose**(`_resourceManager`): `void`

Defined in: [elements/physics/SoftBody.ts:167](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/SoftBody.ts#L167)

#### Parameters

##### \_resourceManager

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
