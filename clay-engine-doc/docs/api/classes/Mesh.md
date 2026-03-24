[**webgpu-engine**](../README.md)

***

[webgpu-engine](../README.md) / Mesh

# Class: Mesh

Defined in: [scene/objects/Mesh.ts:18](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/objects/Mesh.ts#L18)

Aggregate root da Camada 2 para objetos renderizáveis.
O desenvolvedor instancia Mesh — nunca Entity vazia.
Transform, Geometry, Material e corpos físicos são compostos internamente.

## Example

```ts
const mesh = new Mesh(new BoxGeometry(), new StandardMaterial());
mesh.position[1] = 2;
scene.add(mesh);
```

## Extends

- [`Entity`](Entity.md)

## Constructors

### Constructor

> **new Mesh**(`geometry`, `material`): `Mesh`

Defined in: [scene/objects/Mesh.ts:21](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/objects/Mesh.ts#L21)

#### Parameters

##### geometry

[`Geometry`](Geometry.md)

##### material

[`Material`](Material.md)

#### Returns

`Mesh`

#### Overrides

[`Entity`](Entity.md).[`constructor`](Entity.md#constructor)

## Properties

### children

> **children**: [`Entity`](Entity.md)[] = `[]`

Defined in: [scene/core/Entity.ts:20](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/Entity.ts#L20)

#### Inherited from

[`Entity`](Entity.md).[`children`](Entity.md#children)

***

### id

> `readonly` **id**: `number` = `++Entity.nextId`

Defined in: [scene/core/Entity.ts:13](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/Entity.ts#L13)

#### Inherited from

[`Entity`](Entity.md).[`id`](Entity.md#id)

***

### isEntity

> **isEntity**: `boolean` = `true`

Defined in: [scene/core/Entity.ts:15](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/Entity.ts#L15)

#### Inherited from

[`Entity`](Entity.md).[`isEntity`](Entity.md#isentity)

***

### name

> **name**: `string` = `"Entity"`

Defined in: [scene/core/Entity.ts:17](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/Entity.ts#L17)

#### Inherited from

[`Entity`](Entity.md).[`name`](Entity.md#name)

***

### parent

> **parent**: [`Entity`](Entity.md) \| `null` = `null`

Defined in: [scene/core/Entity.ts:19](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/Entity.ts#L19)

#### Inherited from

[`Entity`](Entity.md).[`parent`](Entity.md#parent)

***

### visible

> **visible**: `boolean` = `true`

Defined in: [scene/core/Entity.ts:16](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/Entity.ts#L16)

#### Inherited from

[`Entity`](Entity.md).[`visible`](Entity.md#visible)

## Accessors

### geometry

#### Get Signature

> **get** **geometry**(): [`Geometry`](Geometry.md)

Defined in: [scene/objects/Mesh.ts:38](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/objects/Mesh.ts#L38)

##### Returns

[`Geometry`](Geometry.md)

***

### material

#### Get Signature

> **get** **material**(): [`Material`](Material.md)

Defined in: [scene/objects/Mesh.ts:42](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/objects/Mesh.ts#L42)

##### Returns

[`Material`](Material.md)

***

### position

#### Get Signature

> **get** **position**(): `vec3`

Defined in: [scene/objects/Mesh.ts:29](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/objects/Mesh.ts#L29)

##### Returns

`vec3`

***

### rotation

#### Get Signature

> **get** **rotation**(): `quat`

Defined in: [scene/objects/Mesh.ts:30](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/objects/Mesh.ts#L30)

##### Returns

`quat`

***

### scale

#### Get Signature

> **get** **scale**(): `vec3`

Defined in: [scene/objects/Mesh.ts:31](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/objects/Mesh.ts#L31)

##### Returns

`vec3`

## Methods

### add()

> **add**(`object`): `this`

Defined in: [scene/core/Entity.ts:40](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/Entity.ts#L40)

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

Defined in: [scene/core/EventDispatcher.ts:17](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/EventDispatcher.ts#L17)

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

### addPhysics()

> **addPhysics**(`physic`): `this`

Defined in: [scene/objects/Mesh.ts:33](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/objects/Mesh.ts#L33)

#### Parameters

##### physic

[`Physic`](../interfaces/Physic.md)

#### Returns

`this`

***

### clearEventListeners()

> **clearEventListeners**(): `void`

Defined in: [scene/core/EventDispatcher.ts:53](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/EventDispatcher.ts#L53)

Remove todos os listeners (ideal para cleanup de lixo na memória).

#### Returns

`void`

#### Inherited from

[`Entity`](Entity.md).[`clearEventListeners`](Entity.md#cleareventlisteners)

***

### dispatchEvent()

> **dispatchEvent**(`event`): `void`

Defined in: [scene/core/EventDispatcher.ts:60](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/EventDispatcher.ts#L60)

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

Defined in: [scene/core/Entity.ts:86](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/Entity.ts#L86)

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

Defined in: [scene/core/Entity.ts:90](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/Entity.ts#L90)

#### Returns

`IterableIterator`\<[`Component`](../interfaces/Component.md)\>

#### Inherited from

[`Entity`](Entity.md).[`getComponents`](Entity.md#getcomponents)

***

### getPhysics()

> **getPhysics**(): `IterableIterator`\<[`Physic`](../interfaces/Physic.md)\>

Defined in: [scene/core/Entity.ts:94](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/Entity.ts#L94)

#### Returns

`IterableIterator`\<[`Physic`](../interfaces/Physic.md)\>

#### Inherited from

[`Entity`](Entity.md).[`getPhysics`](Entity.md#getphysics)

***

### hasComponent()

> **hasComponent**(`type`): `boolean`

Defined in: [scene/core/Entity.ts:98](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/Entity.ts#L98)

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

Defined in: [scene/core/EventDispatcher.ts:32](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/EventDispatcher.ts#L32)

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

Defined in: [scene/core/Entity.ts:63](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/Entity.ts#L63)

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

Defined in: [scene/core/EventDispatcher.ts:40](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/EventDispatcher.ts#L40)

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

Defined in: [scene/core/Entity.ts:105](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/Entity.ts#L105)

Travessia genérica na Árvore Espacial.

#### Parameters

##### callback

(`entity`) => `void`

#### Returns

`void`

#### Inherited from

[`Entity`](Entity.md).[`traverse`](Entity.md#traverse)
