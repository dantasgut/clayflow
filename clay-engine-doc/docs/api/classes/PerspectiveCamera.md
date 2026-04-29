# Class: PerspectiveCamera

Defined in: [elements/cameras/PerspectiveCamera.ts:13](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/cameras/PerspectiveCamera.ts#L13)

Câmera com projeção perspectiva. (Camada 3)

## Example

```ts
const camera = new PerspectiveCamera(Math.PI / 4, canvas.width / canvas.height, 0.1, 1000);
camera.position[1] = 3;
camera.position[2] = 8;
scene.add(camera);
renderer.render(scene, camera);
```

## Extends

- [`Camera`](Camera.md)

## Constructors

### Constructor

> **new PerspectiveCamera**(`fovY`, `aspect`, `near`, `far`): `PerspectiveCamera`

Defined in: [elements/cameras/PerspectiveCamera.ts:14](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/cameras/PerspectiveCamera.ts#L14)

#### Parameters

##### fovY

`number`

##### aspect

`number`

##### near

`number`

##### far

`number`

#### Returns

`PerspectiveCamera`

#### Overrides

[`Camera`](Camera.md).[`constructor`](Camera.md#constructor)

## Properties

### cam

> `protected` `readonly` **cam**: `CameraComponent`

Defined in: [elements/cameras/Camera.ts:14](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/cameras/Camera.ts#L14)

#### Inherited from

[`Camera`](Camera.md).[`cam`](Camera.md#cam)

***

### children

> **children**: [`Entity`](Entity.md)[] = `[]`

Defined in: [scene/core/Entity.ts:20](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/core/Entity.ts#L20)

#### Inherited from

[`Camera`](Camera.md).[`children`](Camera.md#children)

***

### id

> `readonly` **id**: `number` = `++Entity.nextId`

Defined in: [scene/core/Entity.ts:13](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/core/Entity.ts#L13)

#### Inherited from

[`Camera`](Camera.md).[`id`](Camera.md#id)

***

### isEntity

> **isEntity**: `boolean` = `true`

Defined in: [scene/core/Entity.ts:15](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/core/Entity.ts#L15)

#### Inherited from

[`Camera`](Camera.md).[`isEntity`](Camera.md#isentity)

***

### name

> **name**: `string` = `"Entity"`

Defined in: [scene/core/Entity.ts:17](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/core/Entity.ts#L17)

#### Inherited from

[`Camera`](Camera.md).[`name`](Camera.md#name)

***

### parent

> **parent**: [`Entity`](Entity.md) \| `null` = `null`

Defined in: [scene/core/Entity.ts:19](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/core/Entity.ts#L19)

#### Inherited from

[`Camera`](Camera.md).[`parent`](Camera.md#parent)

***

### transform

> `protected` `readonly` **transform**: [`Transform`](Transform.md)

Defined in: [elements/cameras/Camera.ts:13](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/cameras/Camera.ts#L13)

#### Inherited from

[`Camera`](Camera.md).[`transform`](Camera.md#transform)

***

### visible

> **visible**: `boolean` = `true`

Defined in: [scene/core/Entity.ts:16](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/core/Entity.ts#L16)

#### Inherited from

[`Camera`](Camera.md).[`visible`](Camera.md#visible)

## Accessors

### position

#### Get Signature

> **get** **position**(): `vec3`

Defined in: [elements/cameras/Camera.ts:25](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/cameras/Camera.ts#L25)

Posição da câmera no mundo (atalho direto para transform.position).

##### Returns

`vec3`

#### Inherited from

[`Camera`](Camera.md).[`position`](Camera.md#position)

***

### projectionMatrix

#### Get Signature

> **get** **projectionMatrix**(): `mat4`

Defined in: [elements/cameras/Camera.ts:33](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/cameras/Camera.ts#L33)

##### Returns

`mat4`

#### Inherited from

[`Camera`](Camera.md).[`projectionMatrix`](Camera.md#projectionmatrix)

***

### viewProjectionMatrix

#### Get Signature

> **get** **viewProjectionMatrix**(): `mat4`

Defined in: [elements/cameras/Camera.ts:29](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/cameras/Camera.ts#L29)

##### Returns

`mat4`

#### Inherited from

[`Camera`](Camera.md).[`viewProjectionMatrix`](Camera.md#viewprojectionmatrix)

## Methods

### add()

> **add**(`object`): `this`

Defined in: [scene/core/Entity.ts:40](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/core/Entity.ts#L40)

Adiciona Entidade filha ou Componente. (Roteamento Automático ECS)

#### Parameters

##### object

`any`

#### Returns

`this`

#### Inherited from

[`Camera`](Camera.md).[`add`](Camera.md#add)

***

### addEventListener()

> **addEventListener**(`type`, `listener`): `void`

Defined in: [scene/core/EventDispatcher.ts:17](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/core/EventDispatcher.ts#L17)

Inscreve uma função callback para escutar um evento específico.

#### Parameters

##### type

`string`

##### listener

(`event`) => `void`

#### Returns

`void`

#### Inherited from

[`Camera`](Camera.md).[`addEventListener`](Camera.md#addeventlistener)

***

### clearEventListeners()

> **clearEventListeners**(): `void`

Defined in: [scene/core/EventDispatcher.ts:53](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/core/EventDispatcher.ts#L53)

Remove todos os listeners (ideal para cleanup de lixo na memória).

#### Returns

`void`

#### Inherited from

[`Camera`](Camera.md).[`clearEventListeners`](Camera.md#cleareventlisteners)

***

### dispatchEvent()

> **dispatchEvent**(`event`): `void`

Defined in: [scene/core/EventDispatcher.ts:60](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/core/EventDispatcher.ts#L60)

Despacha o evento, executando todos os callbacks inscritos para aquele tipo.

#### Parameters

##### event

###### type

`string`

#### Returns

`void`

#### Inherited from

[`Camera`](Camera.md).[`dispatchEvent`](Camera.md#dispatchevent)

***

### getComponent()

> **getComponent**\<`T`\>(`type`): `T` \| `undefined`

Defined in: [scene/core/Entity.ts:86](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/core/Entity.ts#L86)

#### Type Parameters

##### T

`T` *extends* [`Component`](../interfaces/Component.md)

#### Parameters

##### type

`string`

#### Returns

`T` \| `undefined`

#### Inherited from

[`Camera`](Camera.md).[`getComponent`](Camera.md#getcomponent)

***

### getComponents()

> **getComponents**(): `IterableIterator`\<[`Component`](../interfaces/Component.md)\>

Defined in: [scene/core/Entity.ts:90](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/core/Entity.ts#L90)

#### Returns

`IterableIterator`\<[`Component`](../interfaces/Component.md)\>

#### Inherited from

[`Camera`](Camera.md).[`getComponents`](Camera.md#getcomponents)

***

### getPhysics()

> **getPhysics**(): `IterableIterator`\<[`Physic`](../interfaces/Physic.md)\>

Defined in: [scene/core/Entity.ts:94](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/core/Entity.ts#L94)

#### Returns

`IterableIterator`\<[`Physic`](../interfaces/Physic.md)\>

#### Inherited from

[`Camera`](Camera.md).[`getPhysics`](Camera.md#getphysics)

***

### hasComponent()

> **hasComponent**(`type`): `boolean`

Defined in: [scene/core/Entity.ts:98](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/core/Entity.ts#L98)

#### Parameters

##### type

`string`

#### Returns

`boolean`

#### Inherited from

[`Camera`](Camera.md).[`hasComponent`](Camera.md#hascomponent)

***

### hasEventListener()

> **hasEventListener**(`type`, `listener`): `boolean`

Defined in: [scene/core/EventDispatcher.ts:32](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/core/EventDispatcher.ts#L32)

Verifica se existe alguma inscrição para aquele evento e função.

#### Parameters

##### type

`string`

##### listener

(`event`) => `void`

#### Returns

`boolean`

#### Inherited from

[`Camera`](Camera.md).[`hasEventListener`](Camera.md#haseventlistener)

***

### remove()

> **remove**(`object`): `this`

Defined in: [scene/core/Entity.ts:63](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/core/Entity.ts#L63)

#### Parameters

##### object

`any`

#### Returns

`this`

#### Inherited from

[`Camera`](Camera.md).[`remove`](Camera.md#remove)

***

### removeEventListener()

> **removeEventListener**(`type`, `listener`): `void`

Defined in: [scene/core/EventDispatcher.ts:40](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/core/EventDispatcher.ts#L40)

Remove uma inscrição existente.

#### Parameters

##### type

`string`

##### listener

(`event`) => `void`

#### Returns

`void`

#### Inherited from

[`Camera`](Camera.md).[`removeEventListener`](Camera.md#removeeventlistener)

***

### setPerspective()

> **setPerspective**(`fovY`, `aspect`, `near`, `far`): `void`

Defined in: [elements/cameras/PerspectiveCamera.ts:19](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/cameras/PerspectiveCamera.ts#L19)

#### Parameters

##### fovY

`number`

##### aspect

`number`

##### near

`number`

##### far

`number`

#### Returns

`void`

***

### traverse()

> **traverse**(`callback`): `void`

Defined in: [scene/core/Entity.ts:105](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/scene/core/Entity.ts#L105)

Travessia genérica na Árvore Espacial.

#### Parameters

##### callback

(`entity`) => `void`

#### Returns

`void`

#### Inherited from

[`Camera`](Camera.md).[`traverse`](Camera.md#traverse)

***

### updateMatrices()

> **updateMatrices**(): `void`

Defined in: [elements/cameras/Camera.ts:38](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/cameras/Camera.ts#L38)

Recalcula as matrizes de mundo e visão. Chamado pelo renderer a cada frame.

#### Returns

`void`

#### Inherited from

[`Camera`](Camera.md).[`updateMatrices`](Camera.md#updatematrices)
