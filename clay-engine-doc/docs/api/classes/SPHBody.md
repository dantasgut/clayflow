# Class: SPHBody

Defined in: [elements/physics/SPHBody.ts:34](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/elements/physics/SPHBody.ts#L34)

Corpo SPH — fluido WCSPH (Weakly Compressible SPH).

Buffers GPU alocados pelo SPHComputePass (padrão MPMBody/PBFBody).

## Extends

- [`PhysicsBody`](PhysicsBody.md)

## Constructors

### Constructor

> **new SPHBody**(`options?`): `SPHBody`

Defined in: [elements/physics/SPHBody.ts:43](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/elements/physics/SPHBody.ts#L43)

#### Parameters

##### options?

[`SPHBodyOptions`](../interfaces/SPHBodyOptions.md) = `{}`

#### Returns

`SPHBody`

#### Overrides

[`PhysicsBody`](PhysicsBody.md).[`constructor`](PhysicsBody.md#constructor)

## Properties

### acceptedAlgorithms

> `readonly` **acceptedAlgorithms**: readonly `string`[]

Defined in: [elements/physics/SPHBody.ts:38](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/elements/physics/SPHBody.ts#L38)

***

### bodyState

> **bodyState**: [`PhysicsBodyState`](../enumerations/PhysicsBodyState.md) = `PhysicsBodyState.Inactive`

Defined in: [scene/components/physics/PhysicsBody.ts:46](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L46)

Estado de simulação do corpo no mundo físico.

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`bodyState`](PhysicsBody.md#bodystate)

***

### bufferIds?

> `optional` **bufferIds?**: `SPHBufferIds`

Defined in: [elements/physics/SPHBody.ts:40](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/elements/physics/SPHBody.ts#L40)

***

### dirtyFlags

> **dirtyFlags**: `number` = `PhysicsDirtyFlag.None`

Defined in: [scene/components/physics/PhysicsBody.ts:49](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L49)

Bitmask de PhysicsDirtyFlag — indica quais aspectos físicos mudaram.

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`dirtyFlags`](PhysicsBody.md#dirtyflags)

***

### layer

> `readonly` **layer**: [`PHYSICS_MECHANIC`](../enumerations/ResourceType.md#physics_mechanic)

Defined in: [scene/components/physics/PhysicsBody.ts:41](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L41)

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`layer`](PhysicsBody.md#layer)

***

### particles

> **particles**: [`SPHParticleData`](../interfaces/SPHParticleData.md)[] = `[]`

Defined in: [elements/physics/SPHBody.ts:41](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/elements/physics/SPHBody.ts#L41)

***

### physicType

> `readonly` **physicType**: `"SPHBody"` = `'SPHBody'`

Defined in: [elements/physics/SPHBody.ts:36](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/elements/physics/SPHBody.ts#L36)

#### Overrides

[`PhysicsBody`](PhysicsBody.md).[`physicType`](PhysicsBody.md#physictype)

***

### state

> **state**: [`ResourceState`](../enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [scene/components/physics/PhysicsBody.ts:43](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L43)

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`state`](PhysicsBody.md#state)

***

### type

> `readonly` **type**: `"SPHBody"` = `'SPHBody'`

Defined in: [elements/physics/SPHBody.ts:35](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/elements/physics/SPHBody.ts#L35)

#### Overrides

[`PhysicsBody`](PhysicsBody.md).[`type`](PhysicsBody.md#type)

***

### uuid

> `readonly` **uuid**: `string`

Defined in: [scene/components/physics/PhysicsBody.ts:36](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L36)

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`uuid`](PhysicsBody.md#uuid)

## Accessors

### currentState

#### Get Signature

> **get** **currentState**(): `BodyStateHandler`

Defined in: [scene/components/physics/PhysicsBody.ts:56](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L56)

Handler do estado atual — consulta de capacidades pelos stages.

##### Returns

`BodyStateHandler`

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`currentState`](PhysicsBody.md#currentstate)

***

### isSleeping

#### Get Signature

> **get** **isSleeping**(): `boolean`

Defined in: [scene/components/physics/PhysicsBody.ts:82](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L82)

Atalho de compatibilidade — equivale a `bodyState === Sleeping`.
Substitui `body.get<boolean>('isSleeping')` nos stages migrados.

##### Returns

`boolean`

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`isSleeping`](PhysicsBody.md#issleeping)

## Methods

### allocateResource()

> **allocateResource**(`resourceManager`): `Promise`\<`void`\>

Defined in: [scene/components/physics/PhysicsBody.ts:129](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L129)

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

Defined in: [scene/components/physics/PhysicsBody.ts:141](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L141)

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

Defined in: [elements/physics/SPHBody.ts:55](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/elements/physics/SPHBody.ts#L55)

#### Parameters

##### \_resourceManager

`ResourceManager`

#### Returns

`Promise`\<`void`\>

#### Overrides

[`PhysicsBody`](PhysicsBody.md).[`doAllocate`](PhysicsBody.md#doallocate)

***

### doDispose()

> `protected` **doDispose**(`_resourceManager`): `void`

Defined in: [elements/physics/SPHBody.ts:56](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/elements/physics/SPHBody.ts#L56)

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

Defined in: [scene/components/physics/PhysicsBody.ts:102](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L102)

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

Defined in: [scene/components/physics/PhysicsBody.ts:106](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L106)

#### Parameters

##### key

`string`

#### Returns

`boolean`

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`has`](PhysicsBody.md#has)

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

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`registerInWorld`](PhysicsBody.md#registerinworld)

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

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`set`](PhysicsBody.md#set)

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

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`transitionTo`](PhysicsBody.md#transitionto)

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

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`unregisterFromWorld`](PhysicsBody.md#unregisterfromworld)

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

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`updateInWorld`](PhysicsBody.md#updateinworld)

***

### updateResource()

> **updateResource**(`_resourceManager`): `void`

Defined in: [scene/components/physics/PhysicsBody.ts:136](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/components/physics/PhysicsBody.ts#L136)

#### Parameters

##### \_resourceManager

`ResourceManager`

#### Returns

`void`

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`updateResource`](PhysicsBody.md#updateresource)
