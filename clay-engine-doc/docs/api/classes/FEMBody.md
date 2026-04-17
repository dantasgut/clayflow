# Class: FEMBody

Defined in: [elements/physics/FEMBody.ts:37](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/FEMBody.ts#L37)

Corpo deformável FEM — malha volumétrica de tetraedros T4.

Os nós correspondem aos vértices do mesh; os elementos (FEMTetrahedron) definem
a conectividade volumétrica. O pipeline XPBD-FEM opera sobre `nodes` e `elements`,
resolvendo restrições hidrostática e desviadora por tetraedro.

Os buffers GPU são alocados externamente (FEMComputePass), análogo a SoftBody.

## Extends

- [`PhysicsBody`](PhysicsBody.md)

## Constructors

### Constructor

> **new FEMBody**(`options?`): `FEMBody`

Defined in: [elements/physics/FEMBody.ts:49](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/FEMBody.ts#L49)

#### Parameters

##### options?

[`FEMBodyOptions`](../interfaces/FEMBodyOptions.md) = `{}`

#### Returns

`FEMBody`

#### Overrides

[`PhysicsBody`](PhysicsBody.md).[`constructor`](PhysicsBody.md#constructor)

## Properties

### acceptedAlgorithms

> `readonly` **acceptedAlgorithms**: readonly `string`[]

Defined in: [elements/physics/FEMBody.ts:41](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/FEMBody.ts#L41)

***

### bodyState

> **bodyState**: [`PhysicsBodyState`](../enumerations/PhysicsBodyState.md) = `PhysicsBodyState.Inactive`

Defined in: [scene/components/physics/PhysicsBody.ts:46](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/PhysicsBody.ts#L46)

Estado de simulação do corpo no mundo físico.

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`bodyState`](PhysicsBody.md#bodystate)

***

### bufferIds?

> `optional` **bufferIds?**: `FEMBufferIds`

Defined in: [elements/physics/FEMBody.ts:44](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/FEMBody.ts#L44)

Conjunto de IDs de buffers GPU alocados para este corpo.

***

### dirtyFlags

> **dirtyFlags**: `number` = `PhysicsDirtyFlag.None`

Defined in: [scene/components/physics/PhysicsBody.ts:49](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/PhysicsBody.ts#L49)

Bitmask de PhysicsDirtyFlag — indica quais aspectos físicos mudaram.

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`dirtyFlags`](PhysicsBody.md#dirtyflags)

***

### elements

> **elements**: [`FEMTetrahedron`](../interfaces/FEMTetrahedron.md)[] = `[]`

Defined in: [elements/physics/FEMBody.ts:47](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/FEMBody.ts#L47)

***

### layer

> `readonly` **layer**: [`PHYSICS_MECHANIC`](../enumerations/ResourceType.md#physics_mechanic)

Defined in: [scene/components/physics/PhysicsBody.ts:41](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/PhysicsBody.ts#L41)

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`layer`](PhysicsBody.md#layer)

***

### nodes

> **nodes**: [`FEMNode`](../interfaces/FEMNode.md)[] = `[]`

Defined in: [elements/physics/FEMBody.ts:46](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/FEMBody.ts#L46)

***

### physicType

> `readonly` **physicType**: `"FEMBody"` = `'FEMBody'`

Defined in: [elements/physics/FEMBody.ts:39](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/FEMBody.ts#L39)

#### Overrides

[`PhysicsBody`](PhysicsBody.md).[`physicType`](PhysicsBody.md#physictype)

***

### state

> **state**: [`ResourceState`](../enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [scene/components/physics/PhysicsBody.ts:43](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/PhysicsBody.ts#L43)

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`state`](PhysicsBody.md#state)

***

### type

> `readonly` **type**: `"FEMBody"` = `'FEMBody'`

Defined in: [elements/physics/FEMBody.ts:38](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/FEMBody.ts#L38)

#### Overrides

[`PhysicsBody`](PhysicsBody.md).[`type`](PhysicsBody.md#type)

***

### uuid

> `readonly` **uuid**: `string`

Defined in: [scene/components/physics/PhysicsBody.ts:36](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/PhysicsBody.ts#L36)

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`uuid`](PhysicsBody.md#uuid)

## Accessors

### currentState

#### Get Signature

> **get** **currentState**(): `BodyStateHandler`

Defined in: [scene/components/physics/PhysicsBody.ts:56](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/PhysicsBody.ts#L56)

Handler do estado atual — consulta de capacidades pelos stages.

##### Returns

`BodyStateHandler`

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`currentState`](PhysicsBody.md#currentstate)

***

### isSleeping

#### Get Signature

> **get** **isSleeping**(): `boolean`

Defined in: [scene/components/physics/PhysicsBody.ts:82](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/PhysicsBody.ts#L82)

Atalho de compatibilidade — equivale a `bodyState === Sleeping`.
Substitui `body.get<boolean>('isSleeping')` nos stages migrados.

##### Returns

`boolean`

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`isSleeping`](PhysicsBody.md#issleeping)

## Methods

### allocateResource()

> **allocateResource**(`resourceManager`): `Promise`\<`void`\>

Defined in: [scene/components/physics/PhysicsBody.ts:129](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/PhysicsBody.ts#L129)

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

Defined in: [scene/components/physics/PhysicsBody.ts:141](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/PhysicsBody.ts#L141)

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

Defined in: [elements/physics/FEMBody.ts:59](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/FEMBody.ts#L59)

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

Defined in: [elements/physics/FEMBody.ts:63](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/FEMBody.ts#L63)

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

Defined in: [scene/components/physics/PhysicsBody.ts:102](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/PhysicsBody.ts#L102)

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

Defined in: [scene/components/physics/PhysicsBody.ts:106](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/PhysicsBody.ts#L106)

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

Defined in: [scene/components/physics/PhysicsBody.ts:114](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/PhysicsBody.ts#L114)

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

Defined in: [scene/components/physics/PhysicsBody.ts:97](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/PhysicsBody.ts#L97)

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

Defined in: [scene/components/physics/PhysicsBody.ts:64](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/PhysicsBody.ts#L64)

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

Defined in: [scene/components/physics/PhysicsBody.ts:116](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/PhysicsBody.ts#L116)

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

Defined in: [scene/components/physics/PhysicsBody.ts:115](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/PhysicsBody.ts#L115)

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

Defined in: [scene/components/physics/PhysicsBody.ts:136](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/PhysicsBody.ts#L136)

#### Parameters

##### \_resourceManager

`ResourceManager`

#### Returns

`void`

#### Inherited from

[`PhysicsBody`](PhysicsBody.md).[`updateResource`](PhysicsBody.md#updateresource)
