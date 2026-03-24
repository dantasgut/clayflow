# Abstract Class: Camera

Defined in: [elements/cameras/Camera.ts:12](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/cameras/Camera.ts#L12)

Aggregate root de câmera. (Camada 3)
Empacota Entity + Transform + CameraComponent — o usuário nunca vê a entidade hospedeira.

Subclasses concretas: PerspectiveCamera, OrthographicCamera.

## Extends

- [`Entity`](Entity.md)

## Extended by

- [`PerspectiveCamera`](PerspectiveCamera.md)

## Constructors

### Constructor

> **new Camera**(): `Camera`

Defined in: [elements/cameras/Camera.ts:16](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/cameras/Camera.ts#L16)

#### Returns

`Camera`

#### Overrides

[`Entity`](Entity.md).[`constructor`](Entity.md#constructor)

## Properties

### cam

> `protected` `readonly` **cam**: `CameraComponent`

Defined in: [elements/cameras/Camera.ts:14](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/cameras/Camera.ts#L14)

***

### children

> **children**: [`Entity`](Entity.md)[] = `[]`

Defined in: [scene/core/Entity.ts:20](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/core/Entity.ts#L20)

#### Inherited from

[`Entity`](Entity.md).[`children`](Entity.md#children)

***

### id

> `readonly` **id**: `number` = `++Entity.nextId`

Defined in: [scene/core/Entity.ts:13](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/core/Entity.ts#L13)

#### Inherited from

[`Entity`](Entity.md).[`id`](Entity.md#id)

***

### isEntity

> **isEntity**: `boolean` = `true`

Defined in: [scene/core/Entity.ts:15](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/core/Entity.ts#L15)

#### Inherited from

[`Entity`](Entity.md).[`isEntity`](Entity.md#isentity)

***

### name

> **name**: `string` = `"Entity"`

Defined in: [scene/core/Entity.ts:17](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/core/Entity.ts#L17)

#### Inherited from

[`Entity`](Entity.md).[`name`](Entity.md#name)

***

### parent

> **parent**: [`Entity`](Entity.md) \| `null` = `null`

Defined in: [scene/core/Entity.ts:19](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/core/Entity.ts#L19)

#### Inherited from

[`Entity`](Entity.md).[`parent`](Entity.md#parent)

***

### transform

> `protected` `readonly` **transform**: [`Transform`](Transform.md)

Defined in: [elements/cameras/Camera.ts:13](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/cameras/Camera.ts#L13)

***

### visible

> **visible**: `boolean` = `true`

Defined in: [scene/core/Entity.ts:16](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/core/Entity.ts#L16)

#### Inherited from

[`Entity`](Entity.md).[`visible`](Entity.md#visible)

## Accessors

### position

#### Get Signature

> **get** **position**(): `vec3`

Defined in: [elements/cameras/Camera.ts:25](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/cameras/Camera.ts#L25)

Posição da câmera no mundo (atalho direto para transform.position).

##### Returns

`vec3`

***

### projectionMatrix

#### Get Signature

> **get** **projectionMatrix**(): `mat4`

Defined in: [elements/cameras/Camera.ts:33](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/cameras/Camera.ts#L33)

##### Returns

`mat4`

***

### viewProjectionMatrix

#### Get Signature

> **get** **viewProjectionMatrix**(): `mat4`

Defined in: [elements/cameras/Camera.ts:29](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/cameras/Camera.ts#L29)

##### Returns

`mat4`

## Methods

### add()

> **add**(`object`): `this`

Defined in: [scene/core/Entity.ts:40](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/core/Entity.ts#L40)

Adiciona Entidade filha ou Componente. (Roteamento Automático ECS)

#### Parameters

##### object

`any`

#### Returns

`this`

#### Inherited from

[`Entity`](Entity.md).[`add`](Entity.md#add)

***

### addEventListener()

> **addEventListener**(`type`, `listener`): `void`

Defined in: [scene/core/EventDispatcher.ts:17](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/core/EventDispatcher.ts#L17)

Inscreve uma função callback para escutar um evento específico.

#### Parameters

##### type

`string`

##### listener

(`event`) => `void`

#### Returns

`void`

#### Inherited from

[`Entity`](Entity.md).[`addEventListener`](Entity.md#addeventlistener)

***

### clearEventListeners()

> **clearEventListeners**(): `void`

Defined in: [scene/core/EventDispatcher.ts:53](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/core/EventDispatcher.ts#L53)

Remove todos os listeners (ideal para cleanup de lixo na memória).

#### Returns

`void`

#### Inherited from

[`Entity`](Entity.md).[`clearEventListeners`](Entity.md#cleareventlisteners)

***

### dispatchEvent()

> **dispatchEvent**(`event`): `void`

Defined in: [scene/core/EventDispatcher.ts:60](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/core/EventDispatcher.ts#L60)

Despacha o evento, executando todos os callbacks inscritos para aquele tipo.

#### Parameters

##### event

###### type

`string`

#### Returns

`void`

#### Inherited from

[`Entity`](Entity.md).[`dispatchEvent`](Entity.md#dispatchevent)

***

### getComponent()

> **getComponent**\<`T`\>(`type`): `T` \| `undefined`

Defined in: [scene/core/Entity.ts:86](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/core/Entity.ts#L86)

#### Type Parameters

##### T

`T` *extends* [`Component`](../interfaces/Component.md)

#### Parameters

##### type

`string`

#### Returns

`T` \| `undefined`

#### Inherited from

[`Entity`](Entity.md).[`getComponent`](Entity.md#getcomponent)

***

### getComponents()

> **getComponents**(): `IterableIterator`\<[`Component`](../interfaces/Component.md)\>

Defined in: [scene/core/Entity.ts:90](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/core/Entity.ts#L90)

#### Returns

`IterableIterator`\<[`Component`](../interfaces/Component.md)\>

#### Inherited from

[`Entity`](Entity.md).[`getComponents`](Entity.md#getcomponents)

***

### getPhysics()

> **getPhysics**(): `IterableIterator`\<[`Physic`](../interfaces/Physic.md)\>

Defined in: [scene/core/Entity.ts:94](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/core/Entity.ts#L94)

#### Returns

`IterableIterator`\<[`Physic`](../interfaces/Physic.md)\>

#### Inherited from

[`Entity`](Entity.md).[`getPhysics`](Entity.md#getphysics)

***

### hasComponent()

> **hasComponent**(`type`): `boolean`

Defined in: [scene/core/Entity.ts:98](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/core/Entity.ts#L98)

#### Parameters

##### type

`string`

#### Returns

`boolean`

#### Inherited from

[`Entity`](Entity.md).[`hasComponent`](Entity.md#hascomponent)

***

### hasEventListener()

> **hasEventListener**(`type`, `listener`): `boolean`

Defined in: [scene/core/EventDispatcher.ts:32](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/core/EventDispatcher.ts#L32)

Verifica se existe alguma inscrição para aquele evento e função.

#### Parameters

##### type

`string`

##### listener

(`event`) => `void`

#### Returns

`boolean`

#### Inherited from

[`Entity`](Entity.md).[`hasEventListener`](Entity.md#haseventlistener)

***

### remove()

> **remove**(`object`): `this`

Defined in: [scene/core/Entity.ts:63](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/core/Entity.ts#L63)

#### Parameters

##### object

`any`

#### Returns

`this`

#### Inherited from

[`Entity`](Entity.md).[`remove`](Entity.md#remove)

***

### removeEventListener()

> **removeEventListener**(`type`, `listener`): `void`

Defined in: [scene/core/EventDispatcher.ts:40](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/core/EventDispatcher.ts#L40)

Remove uma inscrição existente.

#### Parameters

##### type

`string`

##### listener

(`event`) => `void`

#### Returns

`void`

#### Inherited from

[`Entity`](Entity.md).[`removeEventListener`](Entity.md#removeeventlistener)

***

### traverse()

> **traverse**(`callback`): `void`

Defined in: [scene/core/Entity.ts:105](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/core/Entity.ts#L105)

Travessia genérica na Árvore Espacial.

#### Parameters

##### callback

(`entity`) => `void`

#### Returns

`void`

#### Inherited from

[`Entity`](Entity.md).[`traverse`](Entity.md#traverse)

***

### updateMatrices()

> **updateMatrices**(): `void`

Defined in: [elements/cameras/Camera.ts:38](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/cameras/Camera.ts#L38)

Recalcula as matrizes de mundo e visão. Chamado pelo renderer a cada frame.

#### Returns

`void`
