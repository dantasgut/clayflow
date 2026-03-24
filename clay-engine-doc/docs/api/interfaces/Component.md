[**webgpu-engine**](../README.md)

***

[webgpu-engine](../README.md) / Component

# Interface: Component

Defined in: [scene/core/Component.ts:9](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/Component.ts#L9)

Interface base para qualquer Componente Visual/Lógico estrito
ancorado a uma Entidade.

## Extends

- [`Resource`](Resource.md)

## Properties

### layer

> `readonly` **layer**: [`VISUAL_COMPONENT`](../enumerations/ResourceType.md#visual_component)

Defined in: [scene/core/Component.ts:10](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/Component.ts#L10)

***

### state?

> `optional` **state?**: [`ResourceState`](../enumerations/ResourceState.md)

Defined in: [scene/core/Resource.ts:13](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/Resource.ts#L13)

#### Inherited from

[`Resource`](Resource.md).[`state`](Resource.md#state)

***

### type

> `readonly` **type**: `string`

Defined in: [scene/core/Resource.ts:11](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/Resource.ts#L11)

#### Inherited from

[`Resource`](Resource.md).[`type`](Resource.md#type)

***

### uuid?

> `readonly` `optional` **uuid?**: `string`

Defined in: [scene/core/Resource.ts:12](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/Resource.ts#L12)

#### Inherited from

[`Resource`](Resource.md).[`uuid`](Resource.md#uuid)

## Methods

### allocateResource()?

> `optional` **allocateResource**(`resourceManager`): `void` \| `Promise`\<`void`\>

Defined in: [scene/core/Resource.ts:15](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/Resource.ts#L15)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`void` \| `Promise`\<`void`\>

#### Inherited from

[`Resource`](Resource.md).[`allocateResource`](Resource.md#allocateresource)

***

### disposeResource()?

> `optional` **disposeResource**(`resourceManager`): `void`

Defined in: [scene/core/Resource.ts:17](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/Resource.ts#L17)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`void`

#### Inherited from

[`Resource`](Resource.md).[`disposeResource`](Resource.md#disposeresource)

***

### onAttach()?

> `optional` **onAttach**(`entity`): `void`

Defined in: [scene/core/Component.ts:12](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/Component.ts#L12)

#### Parameters

##### entity

[`Entity`](../classes/Entity.md)

#### Returns

`void`

***

### onDetach()?

> `optional` **onDetach**(`entity`): `void`

Defined in: [scene/core/Component.ts:13](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/Component.ts#L13)

#### Parameters

##### entity

[`Entity`](../classes/Entity.md)

#### Returns

`void`

***

### updateResource()?

> `optional` **updateResource**(`resourceManager`): `void` \| `Promise`\<`void`\>

Defined in: [scene/core/Resource.ts:16](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/Resource.ts#L16)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`void` \| `Promise`\<`void`\>

#### Inherited from

[`Resource`](Resource.md).[`updateResource`](Resource.md#updateresource)
