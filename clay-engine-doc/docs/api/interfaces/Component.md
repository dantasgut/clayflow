# Interface: Component

Defined in: [scene/core/Component.ts:9](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/core/Component.ts#L9)

Interface base para qualquer Componente Visual/Lógico estrito
ancorado a uma Entidade.

## Extends

- [`Resource`](Resource.md)

## Properties

### currentResourceState?

> `readonly` `optional` **currentResourceState?**: `ResourceStateHandler`

Defined in: [scene/core/Resource.ts:17](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/core/Resource.ts#L17)

Handler do estado atual — consulta de capacidades pelos consumidores.

#### Inherited from

[`Resource`](Resource.md).[`currentResourceState`](Resource.md#currentresourcestate)

***

### layer

> `readonly` **layer**: [`VISUAL_COMPONENT`](../enumerations/ResourceType.md#visual_component)

Defined in: [scene/core/Component.ts:10](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/core/Component.ts#L10)

***

### state?

> `optional` **state?**: [`ResourceState`](../enumerations/ResourceState.md)

Defined in: [scene/core/Resource.ts:14](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/core/Resource.ts#L14)

#### Inherited from

[`Resource`](Resource.md).[`state`](Resource.md#state)

***

### type

> `readonly` **type**: `string`

Defined in: [scene/core/Resource.ts:12](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/core/Resource.ts#L12)

#### Inherited from

[`Resource`](Resource.md).[`type`](Resource.md#type)

***

### uuid?

> `readonly` `optional` **uuid?**: `string`

Defined in: [scene/core/Resource.ts:13](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/core/Resource.ts#L13)

#### Inherited from

[`Resource`](Resource.md).[`uuid`](Resource.md#uuid)

## Methods

### allocateResource()?

> `optional` **allocateResource**(`resourceManager`): `void` \| `Promise`\<`void`\>

Defined in: [scene/core/Resource.ts:19](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/core/Resource.ts#L19)

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

Defined in: [scene/core/Resource.ts:21](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/core/Resource.ts#L21)

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

Defined in: [scene/core/Component.ts:12](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/core/Component.ts#L12)

#### Parameters

##### entity

[`Entity`](../classes/Entity.md)

#### Returns

`void`

***

### onDetach()?

> `optional` **onDetach**(`entity`): `void`

Defined in: [scene/core/Component.ts:13](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/core/Component.ts#L13)

#### Parameters

##### entity

[`Entity`](../classes/Entity.md)

#### Returns

`void`

***

### updateResource()?

> `optional` **updateResource**(`resourceManager`): `void` \| `Promise`\<`void`\>

Defined in: [scene/core/Resource.ts:20](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/core/Resource.ts#L20)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`void` \| `Promise`\<`void`\>

#### Inherited from

[`Resource`](Resource.md).[`updateResource`](Resource.md#updateresource)
