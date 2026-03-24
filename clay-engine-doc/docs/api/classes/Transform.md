[**webgpu-engine**](../README.md)

***

[webgpu-engine](../README.md) / Transform

# Class: Transform

Defined in: [scene/math/Transform.ts:10](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/math/Transform.ts#L10)

Componente Lógico responsável EXCLUSIVAMENTE pela Matemática Espacial.
Resolve posição, rotação, escala e parentesco (Álgebra Linear Pura/Composite).

## Implements

- [`Component`](../interfaces/Component.md)

## Constructors

### Constructor

> **new Transform**(): `Transform`

#### Returns

`Transform`

## Properties

### children

> **children**: `Transform`[] = `[]`

Defined in: [scene/math/Transform.ts:25](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/math/Transform.ts#L25)

***

### layer

> `readonly` **layer**: [`VISUAL_COMPONENT`](../enumerations/ResourceType.md#visual_component) = `ResourceType.VISUAL_COMPONENT`

Defined in: [scene/math/Transform.ts:11](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/math/Transform.ts#L11)

#### Implementation of

[`Component`](../interfaces/Component.md).[`layer`](../interfaces/Component.md#layer)

***

### localMatrix

> **localMatrix**: `mat4`

Defined in: [scene/math/Transform.ts:20](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/math/Transform.ts#L20)

***

### matrixWorldNeedsUpdate

> **matrixWorldNeedsUpdate**: `boolean` = `true`

Defined in: [scene/math/Transform.ts:28](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/math/Transform.ts#L28)

***

### owner

> **owner**: [`Entity`](Entity.md) \| `null` = `null`

Defined in: [scene/math/Transform.ts:31](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/math/Transform.ts#L31)

***

### parent

> **parent**: `Transform` \| `null` = `null`

Defined in: [scene/math/Transform.ts:24](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/math/Transform.ts#L24)

***

### position

> **position**: `vec3`

Defined in: [scene/math/Transform.ts:15](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/math/Transform.ts#L15)

***

### rotation

> **rotation**: `quat`

Defined in: [scene/math/Transform.ts:16](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/math/Transform.ts#L16)

***

### scale

> **scale**: `vec3`

Defined in: [scene/math/Transform.ts:17](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/math/Transform.ts#L17)

***

### type

> `readonly` **type**: `"Transform"` = `'Transform'`

Defined in: [scene/math/Transform.ts:12](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/math/Transform.ts#L12)

#### Implementation of

[`Component`](../interfaces/Component.md).[`type`](../interfaces/Component.md#type)

***

### worldMatrix

> **worldMatrix**: `mat4`

Defined in: [scene/math/Transform.ts:21](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/math/Transform.ts#L21)

## Methods

### add()

> **add**(`childTransform`): `this`

Defined in: [scene/math/Transform.ts:93](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/math/Transform.ts#L93)

Adiciona um Transform filho.

#### Parameters

##### childTransform

`Transform`

#### Returns

`this`

***

### onAttach()

> **onAttach**(`entity`): `void`

Defined in: [scene/math/Transform.ts:46](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/math/Transform.ts#L46)

#### Parameters

##### entity

[`Entity`](Entity.md)

#### Returns

`void`

#### Implementation of

[`Component`](../interfaces/Component.md).[`onAttach`](../interfaces/Component.md#onattach)

***

### onDetach()

> **onDetach**(`entity`): `void`

Defined in: [scene/math/Transform.ts:59](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/math/Transform.ts#L59)

#### Parameters

##### entity

[`Entity`](Entity.md)

#### Returns

`void`

#### Implementation of

[`Component`](../interfaces/Component.md).[`onDetach`](../interfaces/Component.md#ondetach)

***

### onMatrixUpdate()

> **onMatrixUpdate**(`cb`): () => `void`

Defined in: [scene/math/Transform.ts:39](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/math/Transform.ts#L39)

Registra um listener para quando a worldMatrix for recalculada.
Retorna uma função de cancelamento (unsubscribe).

#### Parameters

##### cb

(`worldMatrix`) => `void`

#### Returns

() => `void`

***

### remove()

> **remove**(`childTransform`): `this`

Defined in: [scene/math/Transform.ts:108](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/math/Transform.ts#L108)

#### Parameters

##### childTransform

`Transform`

#### Returns

`this`

***

### updateWorldMatrix()

> **updateWorldMatrix**(`updateParents?`, `updateChildren?`): `void`

Defined in: [scene/math/Transform.ts:120](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/math/Transform.ts#L120)

Calcula as matrizes correndo a árvore.

#### Parameters

##### updateParents?

`boolean` = `false`

##### updateChildren?

`boolean` = `true`

#### Returns

`void`
