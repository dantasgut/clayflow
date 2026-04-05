# Class: RigidBody

Defined in: [elements/physics/RigidBody.ts:26](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/elements/physics/RigidBody.ts#L26)

Corpo rígido GPU-only.

`material`  — propriedades de material (massa, atrito, etc.) definidas na construção.
`simState`  — estado de simulação (posição, velocidade, etc.) inicializado em registerEntity.
`gpuRbIndex`— índice no buffer global `gpu_rb_bodies`, atribuído pelo `PhysicsResourceLoader`.

## Extends

- [`PhysicsBody`](PhysicsBody.md)

## Constructors

### Constructor

> **new RigidBody**(`options?`): `RigidBody`

Defined in: [elements/physics/RigidBody.ts:47](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/elements/physics/RigidBody.ts#L47)

#### Parameters

##### options?

[`RigidBodyOptions`](../interfaces/RigidBodyOptions.md) = `{}`

#### Returns

`RigidBody`

#### Overrides

[`PhysicsBody`](PhysicsBody.md).[`constructor`](PhysicsBody.md#constructor)

## Properties

### acceptedAlgorithms

> `readonly` **acceptedAlgorithms**: readonly `string`[]

Defined in: [elements/physics/RigidBody.ts:30](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/elements/physics/RigidBody.ts#L30)

***

### bodyState

> **bodyState**: [`PhysicsBodyState`](../enumerations/PhysicsBodyState.md) = `PhysicsBodyState.Inactive`

Defined in: [scene/components/physics/PhysicsBody.ts:46](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/physics/PhysicsBody.ts#L46)

Estado de simulação do corpo no mundo físico.

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`bodyState`](PhysicsBody.md#bodystate)

***

### dirtyFlags

> **dirtyFlags**: `number` = `PhysicsDirtyFlag.None`

Defined in: [scene/components/physics/PhysicsBody.ts:49](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/physics/PhysicsBody.ts#L49)

Bitmask de PhysicsDirtyFlag — indica quais aspectos físicos mudaram.

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`dirtyFlags`](PhysicsBody.md#dirtyflags)

***

### gpuRbIndex?

> `optional` **gpuRbIndex?**: `number`

Defined in: [elements/physics/RigidBody.ts:42](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/elements/physics/RigidBody.ts#L42)

Índice do corpo no buffer global `gpu_rb_bodies`. Atribuído pelo alocador.

***

### isKinematic

> `readonly` **isKinematic**: `boolean`

Defined in: [elements/physics/RigidBody.ts:45](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/elements/physics/RigidBody.ts#L45)

Sinaliza se o corpo deve ser tratado como kinematic na inicialização.

***

### layer

> `readonly` **layer**: [`PHYSICS_MECHANIC`](../enumerations/ResourceType.md#physics_mechanic)

Defined in: [scene/components/physics/PhysicsBody.ts:41](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/physics/PhysicsBody.ts#L41)

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`layer`](PhysicsBody.md#layer)

***

### material

> `readonly` **material**: `RigidBodyMaterial`

Defined in: [elements/physics/RigidBody.ts:33](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/elements/physics/RigidBody.ts#L33)

Propriedades de material — estáticas após construção.

***

### physicType

> `readonly` **physicType**: `"RigidBody"` = `'RigidBody'`

Defined in: [elements/physics/RigidBody.ts:28](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/elements/physics/RigidBody.ts#L28)

#### Overrides

[`PhysicsBody`](PhysicsBody.md).[`physicType`](PhysicsBody.md#physictype)

***

### simState?

> `optional` **simState?**: `RigidBodySimState`

Defined in: [elements/physics/RigidBody.ts:39](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/elements/physics/RigidBody.ts#L39)

Estado de simulação — inicializado por GpuPhysicsOrchestrator.registerEntity()
a partir do Transform e do tensor de inércia do collider.

***

### state

> **state**: [`ResourceState`](../enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [scene/components/physics/PhysicsBody.ts:43](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/physics/PhysicsBody.ts#L43)

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`state`](PhysicsBody.md#state)

***

### type

> `readonly` **type**: `"RigidBody"` = `'RigidBody'`

Defined in: [elements/physics/RigidBody.ts:27](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/elements/physics/RigidBody.ts#L27)

#### Overrides

[`PhysicsBody`](PhysicsBody.md).[`type`](PhysicsBody.md#type)

***

### uuid

> `readonly` **uuid**: `string`

Defined in: [scene/components/physics/PhysicsBody.ts:36](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/physics/PhysicsBody.ts#L36)

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`uuid`](PhysicsBody.md#uuid)

## Accessors

### currentState

#### Get Signature

> **get** **currentState**(): `BodyStateHandler`

Defined in: [scene/components/physics/PhysicsBody.ts:56](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/physics/PhysicsBody.ts#L56)

Handler do estado atual — consulta de capacidades pelos stages.

##### Returns

`BodyStateHandler`

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`currentState`](PhysicsBody.md#currentstate)

***

### isSleeping

#### Get Signature

> **get** **isSleeping**(): `boolean`

Defined in: [scene/components/physics/PhysicsBody.ts:82](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/physics/PhysicsBody.ts#L82)

Atalho de compatibilidade — equivale a `bodyState === Sleeping`.
Substitui `body.get<boolean>('isSleeping')` nos stages migrados.

##### Returns

`boolean`

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`isSleeping`](PhysicsBody.md#issleeping)

***

### mass

#### Get Signature

> **get** **mass**(): `number`

Defined in: [elements/physics/RigidBody.ts:84](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/elements/physics/RigidBody.ts#L84)

##### Returns

`number`

#### Set Signature

> **set** **mass**(`v`): `void`

Defined in: [elements/physics/RigidBody.ts:88](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/elements/physics/RigidBody.ts#L88)

##### Parameters

###### v

`number`

##### Returns

`void`

***

### velocity

#### Get Signature

> **get** **velocity**(): `vec3` \| `undefined`

Defined in: [elements/physics/RigidBody.ts:94](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/elements/physics/RigidBody.ts#L94)

##### Returns

`vec3` \| `undefined`

## Methods

### allocateResource()

> **allocateResource**(`resourceManager`): `Promise`\<`void`\>

Defined in: [scene/components/physics/PhysicsBody.ts:129](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/physics/PhysicsBody.ts#L129)

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

Defined in: [scene/components/physics/PhysicsBody.ts:141](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/physics/PhysicsBody.ts#L141)

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

Defined in: [elements/physics/RigidBody.ts:98](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/elements/physics/RigidBody.ts#L98)

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

Defined in: [elements/physics/RigidBody.ts:102](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/elements/physics/RigidBody.ts#L102)

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

Defined in: [scene/components/physics/PhysicsBody.ts:102](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/physics/PhysicsBody.ts#L102)

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

Defined in: [scene/components/physics/PhysicsBody.ts:106](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/physics/PhysicsBody.ts#L106)

#### Parameters

##### key

`string`

#### Returns

`boolean`

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`has`](PhysicsBody.md#has)

***

### initSimState()

> **initSimState**(`position`, `rotation`): `void`

Defined in: [elements/physics/RigidBody.ts:69](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/elements/physics/RigidBody.ts#L69)

Inicializa simState a partir da posição/rotação do Transform.
Chamado por GpuPhysicsOrchestrator.registerEntity().

#### Parameters

##### position

`ArrayLike`\<`number`\>

##### rotation

`ArrayLike`\<`number`\>

#### Returns

`void`

***

### registerInWorld()

> **registerInWorld**(`_world`): `void`

Defined in: [scene/components/physics/PhysicsBody.ts:114](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/physics/PhysicsBody.ts#L114)

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

Defined in: [scene/components/physics/PhysicsBody.ts:97](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/physics/PhysicsBody.ts#L97)

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

Defined in: [scene/components/physics/PhysicsBody.ts:64](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/physics/PhysicsBody.ts#L64)

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

Defined in: [scene/components/physics/PhysicsBody.ts:116](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/physics/PhysicsBody.ts#L116)

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

Defined in: [scene/components/physics/PhysicsBody.ts:115](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/physics/PhysicsBody.ts#L115)

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

Defined in: [scene/components/physics/PhysicsBody.ts:136](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/physics/PhysicsBody.ts#L136)

#### Parameters

##### \_resourceManager

`ResourceManager`

#### Returns

`void`

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`updateResource`](PhysicsBody.md#updateresource)
