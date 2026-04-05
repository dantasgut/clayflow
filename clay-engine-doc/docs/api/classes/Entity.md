# Class: Entity

Defined in: [scene/core/Entity.ts:11](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/core/Entity.ts#L11)

A Entidade (Container ECS Lógico Puro).
Responsabilidade Única: Segurar Componentes e Relacionar Filhos Lógicamente.
A Matemática (Transform) foi totalmente separada.

## Extends

- `EventDispatcher`

## Extended by

- [`Scene`](Scene.md)
- [`Mesh`](Mesh.md)
- [`Camera`](Camera.md)

## Constructors

### Constructor

> **new Entity**(): `Entity`

Defined in: [scene/core/Entity.ts:28](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/core/Entity.ts#L28)

#### Returns

`Entity`

#### Overrides

`EventDispatcher.constructor`

## Properties

### children

> **children**: `Entity`[] = `[]`

Defined in: [scene/core/Entity.ts:20](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/core/Entity.ts#L20)

***

### id

> `readonly` **id**: `number` = `++Entity.nextId`

Defined in: [scene/core/Entity.ts:13](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/core/Entity.ts#L13)

***

### isEntity

> **isEntity**: `boolean` = `true`

Defined in: [scene/core/Entity.ts:15](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/core/Entity.ts#L15)

***

### name

> **name**: `string` = `"Entity"`

Defined in: [scene/core/Entity.ts:17](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/core/Entity.ts#L17)

***

### parent

> **parent**: `Entity` \| `null` = `null`

Defined in: [scene/core/Entity.ts:19](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/core/Entity.ts#L19)

***

### visible

> **visible**: `boolean` = `true`

Defined in: [scene/core/Entity.ts:16](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/core/Entity.ts#L16)

## Methods

### add()

> **add**(`object`): `this`

Defined in: [scene/core/Entity.ts:40](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/core/Entity.ts#L40)

Adiciona Entidade filha ou Componente. (Roteamento Automático ECS)

#### Parameters

##### object

`any`

#### Returns

`this`

***

### addEventListener()

> **addEventListener**(`type`, `listener`): `void`

Defined in: [scene/core/EventDispatcher.ts:17](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/core/EventDispatcher.ts#L17)

Inscreve uma função callback para escutar um evento específico.

#### Parameters

##### type

`string`

##### listener

(`event`) => `void`

#### Returns

`void`

#### Inherited from

`EventDispatcher.addEventListener`

***

### clearEventListeners()

> **clearEventListeners**(): `void`

Defined in: [scene/core/EventDispatcher.ts:53](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/core/EventDispatcher.ts#L53)

Remove todos os listeners (ideal para cleanup de lixo na memória).

#### Returns

`void`

#### Inherited from

`EventDispatcher.clearEventListeners`

***

### dispatchEvent()

> **dispatchEvent**(`event`): `void`

Defined in: [scene/core/EventDispatcher.ts:60](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/core/EventDispatcher.ts#L60)

Despacha o evento, executando todos os callbacks inscritos para aquele tipo.

#### Parameters

##### event

###### type

`string`

#### Returns

`void`

#### Inherited from

`EventDispatcher.dispatchEvent`

***

### getComponent()

> **getComponent**\<`T`\>(`type`): `T` \| `undefined`

Defined in: [scene/core/Entity.ts:86](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/core/Entity.ts#L86)

#### Type Parameters

##### T

`T` *extends* [`Component`](../interfaces/Component.md)

#### Parameters

##### type

`string`

#### Returns

`T` \| `undefined`

***

### getComponents()

> **getComponents**(): `IterableIterator`\<[`Component`](../interfaces/Component.md)\>

Defined in: [scene/core/Entity.ts:90](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/core/Entity.ts#L90)

#### Returns

`IterableIterator`\<[`Component`](../interfaces/Component.md)\>

***

### getPhysics()

> **getPhysics**(): `IterableIterator`\<[`Physic`](../interfaces/Physic.md)\>

Defined in: [scene/core/Entity.ts:94](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/core/Entity.ts#L94)

#### Returns

`IterableIterator`\<[`Physic`](../interfaces/Physic.md)\>

***

### hasComponent()

> **hasComponent**(`type`): `boolean`

Defined in: [scene/core/Entity.ts:98](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/core/Entity.ts#L98)

#### Parameters

##### type

`string`

#### Returns

`boolean`

***

### hasEventListener()

> **hasEventListener**(`type`, `listener`): `boolean`

Defined in: [scene/core/EventDispatcher.ts:32](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/core/EventDispatcher.ts#L32)

Verifica se existe alguma inscrição para aquele evento e função.

#### Parameters

##### type

`string`

##### listener

(`event`) => `void`

#### Returns

`boolean`

#### Inherited from

`EventDispatcher.hasEventListener`

***

### remove()

> **remove**(`object`): `this`

Defined in: [scene/core/Entity.ts:63](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/core/Entity.ts#L63)

#### Parameters

##### object

`any`

#### Returns

`this`

***

### removeEventListener()

> **removeEventListener**(`type`, `listener`): `void`

Defined in: [scene/core/EventDispatcher.ts:40](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/core/EventDispatcher.ts#L40)

Remove uma inscrição existente.

#### Parameters

##### type

`string`

##### listener

(`event`) => `void`

#### Returns

`void`

#### Inherited from

`EventDispatcher.removeEventListener`

***

### traverse()

> **traverse**(`callback`): `void`

Defined in: [scene/core/Entity.ts:105](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/scene/core/Entity.ts#L105)

Travessia genérica na Árvore Espacial.

#### Parameters

##### callback

(`entity`) => `void`

#### Returns

`void`
