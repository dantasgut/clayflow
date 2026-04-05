# Class: Scene

Defined in: [scene/core/Scene.ts:9](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/core/Scene.ts#L9)

Root container lógico para iteração. (Camada 2 Pura)
Diferente do WebGL, a Scene WebGPU não se renderiza. Ela é apenas 
extraída pelo DoD Pipeline depois.

## Extends

- [`Entity`](Entity.md)

## Constructors

### Constructor

> **new Scene**(): `Scene`

Defined in: [scene/core/Scene.ts:16](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/core/Scene.ts#L16)

#### Returns

`Scene`

#### Overrides

[`Entity`](Entity.md).[`constructor`](Entity.md#constructor)

## Properties

### backgroundColor

> **backgroundColor**: \[`number`, `number`, `number`, `number`\]

Defined in: [scene/core/Scene.ts:14](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/core/Scene.ts#L14)

***

### children

> **children**: [`Entity`](Entity.md)[] = `[]`

Defined in: [scene/core/Entity.ts:20](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/core/Entity.ts#L20)

#### Inherited from

[`Entity`](Entity.md).[`children`](Entity.md#children)

***

### id

> `readonly` **id**: `number` = `++Entity.nextId`

Defined in: [scene/core/Entity.ts:13](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/core/Entity.ts#L13)

#### Inherited from

[`Entity`](Entity.md).[`id`](Entity.md#id)

***

### isEntity

> **isEntity**: `boolean` = `true`

Defined in: [scene/core/Entity.ts:15](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/core/Entity.ts#L15)

#### Inherited from

[`Entity`](Entity.md).[`isEntity`](Entity.md#isentity)

***

### isScene

> **isScene**: `boolean` = `true`

Defined in: [scene/core/Scene.ts:11](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/core/Scene.ts#L11)

***

### name

> **name**: `string` = `"Entity"`

Defined in: [scene/core/Entity.ts:17](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/core/Entity.ts#L17)

#### Inherited from

[`Entity`](Entity.md).[`name`](Entity.md#name)

***

### parent

> **parent**: [`Entity`](Entity.md) \| `null` = `null`

Defined in: [scene/core/Entity.ts:19](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/core/Entity.ts#L19)

#### Inherited from

[`Entity`](Entity.md).[`parent`](Entity.md#parent)

***

### visible

> **visible**: `boolean` = `true`

Defined in: [scene/core/Entity.ts:16](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/core/Entity.ts#L16)

#### Inherited from

[`Entity`](Entity.md).[`visible`](Entity.md#visible)

## Methods

### add()

> **add**(`object`): `this`

Defined in: [scene/core/Entity.ts:40](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/core/Entity.ts#L40)

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

Defined in: [scene/core/EventDispatcher.ts:17](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/core/EventDispatcher.ts#L17)

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

Defined in: [scene/core/EventDispatcher.ts:53](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/core/EventDispatcher.ts#L53)

Remove todos os listeners (ideal para cleanup de lixo na memória).

#### Returns

`void`

#### Inherited from

[`Entity`](Entity.md).[`clearEventListeners`](Entity.md#cleareventlisteners)

***

### dispatchEvent()

> **dispatchEvent**(`event`): `void`

Defined in: [scene/core/EventDispatcher.ts:60](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/core/EventDispatcher.ts#L60)

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

Defined in: [scene/core/Entity.ts:86](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/core/Entity.ts#L86)

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

Defined in: [scene/core/Entity.ts:90](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/core/Entity.ts#L90)

#### Returns

`IterableIterator`\<[`Component`](../interfaces/Component.md)\>

#### Inherited from

[`Entity`](Entity.md).[`getComponents`](Entity.md#getcomponents)

***

### getPhysics()

> **getPhysics**(): `IterableIterator`\<[`Physic`](../interfaces/Physic.md)\>

Defined in: [scene/core/Entity.ts:94](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/core/Entity.ts#L94)

#### Returns

`IterableIterator`\<[`Physic`](../interfaces/Physic.md)\>

#### Inherited from

[`Entity`](Entity.md).[`getPhysics`](Entity.md#getphysics)

***

### hasComponent()

> **hasComponent**(`type`): `boolean`

Defined in: [scene/core/Entity.ts:98](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/core/Entity.ts#L98)

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

Defined in: [scene/core/EventDispatcher.ts:32](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/core/EventDispatcher.ts#L32)

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

### preRenderUpdate()

> **preRenderUpdate**(): `void`

Defined in: [scene/core/Scene.ts:24](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/core/Scene.ts#L24)

Aciona forçosamente a atualização da cascata inteira caso os 'Dirty Flags' sujos precisem
ser alinhados antes da extração Linear.

#### Returns

`void`

***

### remove()

> **remove**(`object`): `this`

Defined in: [scene/core/Entity.ts:63](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/core/Entity.ts#L63)

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

Defined in: [scene/core/EventDispatcher.ts:40](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/core/EventDispatcher.ts#L40)

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

Defined in: [scene/core/Entity.ts:105](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/core/Entity.ts#L105)

Travessia genérica na Árvore Espacial.

#### Parameters

##### callback

(`entity`) => `void`

#### Returns

`void`

#### Inherited from

[`Entity`](Entity.md).[`traverse`](Entity.md#traverse)
