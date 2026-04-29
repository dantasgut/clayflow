# Class: SoftBody

Defined in: [elements/physics/SoftBody.ts:62](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/SoftBody.ts#L62)

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

Defined in: [elements/physics/SoftBody.ts:86](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/SoftBody.ts#L86)

#### Parameters

##### options?

[`SoftBodyOptions`](../interfaces/SoftBodyOptions.md) = `{}`

#### Returns

`SoftBody`

#### Overrides

[`PhysicsBody`](PhysicsBody.md).[`constructor`](PhysicsBody.md#constructor)

## Properties

### acceptedAlgorithms

> `readonly` **acceptedAlgorithms**: readonly `string`[]

Defined in: [elements/physics/SoftBody.ts:72](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/SoftBody.ts#L72)

Algoritmos de simulação que este corpo aceita.
Cada `PhysicsComputePass` filtra corpos cujo `physicType` está em seu
`acceptedPhysicTypes` — este campo permite restringir adicionalmente
a qual algoritmo o corpo será submetido.

***

### bodyState

> **bodyState**: [`PhysicsBodyState`](../enumerations/PhysicsBodyState.md) = `PhysicsBodyState.Inactive`

Defined in: [scene/components/physics/PhysicsBody.ts:46](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/components/physics/PhysicsBody.ts#L46)

Estado de simulação do corpo no mundo físico.

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`bodyState`](PhysicsBody.md#bodystate)

***

### bufferSet?

> `optional` **bufferSet?**: `SoftBodyGpuBufferSet`

Defined in: [elements/physics/SoftBody.ts:79](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/SoftBody.ts#L79)

Conjunto de IDs de buffers alocados para este corpo.
`null` enquanto ainda não alocado — definido pelo `SoftBodyBufferAllocator`.
Substitui as 8+ chaves individuais do Property Bag.

***

### constraints

> **constraints**: [`SoftConstraint`](../interfaces/SoftConstraint.md)[] = `[]`

Defined in: [elements/physics/SoftBody.ts:82](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/SoftBody.ts#L82)

***

### dirtyFlags

> **dirtyFlags**: `number` = `PhysicsDirtyFlag.None`

Defined in: [scene/components/physics/PhysicsBody.ts:49](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/components/physics/PhysicsBody.ts#L49)

Bitmask de PhysicsDirtyFlag — indica quais aspectos físicos mudaram.

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`dirtyFlags`](PhysicsBody.md#dirtyflags)

***

### layer

> `readonly` **layer**: [`PHYSICS_MECHANIC`](../enumerations/ResourceType.md#physics_mechanic)

Defined in: [scene/components/physics/PhysicsBody.ts:41](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/components/physics/PhysicsBody.ts#L41)

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`layer`](PhysicsBody.md#layer)

***

### particles

> **particles**: [`SoftParticle`](../interfaces/SoftParticle.md)[] = `[]`

Defined in: [elements/physics/SoftBody.ts:81](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/SoftBody.ts#L81)

***

### physicType

> `readonly` **physicType**: `"SoftBody"` = `'SoftBody'`

Defined in: [elements/physics/SoftBody.ts:64](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/SoftBody.ts#L64)

#### Overrides

[`PhysicsBody`](PhysicsBody.md).[`physicType`](PhysicsBody.md#physictype)

***

### state

> **state**: [`ResourceState`](../enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [scene/components/physics/PhysicsBody.ts:43](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/components/physics/PhysicsBody.ts#L43)

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`state`](PhysicsBody.md#state)

***

### type

> `readonly` **type**: `"SoftBody"` = `'SoftBody'`

Defined in: [elements/physics/SoftBody.ts:63](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/SoftBody.ts#L63)

#### Overrides

[`PhysicsBody`](PhysicsBody.md).[`type`](PhysicsBody.md#type)

***

### uuid

> `readonly` **uuid**: `string`

Defined in: [scene/components/physics/PhysicsBody.ts:36](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/components/physics/PhysicsBody.ts#L36)

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`uuid`](PhysicsBody.md#uuid)

## Accessors

### currentState

#### Get Signature

> **get** **currentState**(): `BodyStateHandler`

Defined in: [scene/components/physics/PhysicsBody.ts:56](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/components/physics/PhysicsBody.ts#L56)

Handler do estado atual — consulta de capacidades pelos stages.

##### Returns

`BodyStateHandler`

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`currentState`](PhysicsBody.md#currentstate)

***

### isSleeping

#### Get Signature

> **get** **isSleeping**(): `boolean`

Defined in: [scene/components/physics/PhysicsBody.ts:82](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/components/physics/PhysicsBody.ts#L82)

Atalho de compatibilidade — equivale a `bodyState === Sleeping`.
Substitui `body.get<boolean>('isSleeping')` nos stages migrados.

##### Returns

`boolean`

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`isSleeping`](PhysicsBody.md#issleeping)

## Methods

### allocateResource()

> **allocateResource**(`resourceManager`): `Promise`\<`void`\>

Defined in: [scene/components/physics/PhysicsBody.ts:129](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/components/physics/PhysicsBody.ts#L129)

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

Defined in: [scene/components/physics/PhysicsBody.ts:141](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/components/physics/PhysicsBody.ts#L141)

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

Defined in: [elements/physics/SoftBody.ts:177](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/SoftBody.ts#L177)

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

Defined in: [elements/physics/SoftBody.ts:181](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/SoftBody.ts#L181)

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

Defined in: [scene/components/physics/PhysicsBody.ts:102](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/components/physics/PhysicsBody.ts#L102)

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

Defined in: [scene/components/physics/PhysicsBody.ts:106](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/components/physics/PhysicsBody.ts#L106)

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

Defined in: [scene/components/physics/PhysicsBody.ts:114](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/components/physics/PhysicsBody.ts#L114)

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

Defined in: [scene/components/physics/PhysicsBody.ts:97](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/components/physics/PhysicsBody.ts#L97)

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

Defined in: [scene/components/physics/PhysicsBody.ts:64](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/components/physics/PhysicsBody.ts#L64)

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

Defined in: [scene/components/physics/PhysicsBody.ts:116](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/components/physics/PhysicsBody.ts#L116)

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

Defined in: [scene/components/physics/PhysicsBody.ts:115](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/components/physics/PhysicsBody.ts#L115)

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

Defined in: [scene/components/physics/PhysicsBody.ts:136](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/components/physics/PhysicsBody.ts#L136)

#### Parameters

##### \_resourceManager

`ResourceManager`

#### Returns

`void`

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`updateResource`](PhysicsBody.md#updateresource)
