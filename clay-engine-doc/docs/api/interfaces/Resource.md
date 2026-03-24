[**webgpu-engine**](../README.md)

***

[webgpu-engine](../README.md) / Resource

# Interface: Resource

Defined in: [scene/core/Resource.ts:10](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/Resource.ts#L10)

Interface mestre para qualquer nó/elemento estrutural da Engine que possua 
um estado de memória e possa transferir dados para a Placa de Vídeo (VRAM).
- "Componentes Visuais" repassam essa interface.
- "Corpos Lógicos Físicos" implementam isso diretamente.

## Extended by

- [`Component`](Component.md)

## Properties

### state?

> `optional` **state?**: [`ResourceState`](../enumerations/ResourceState.md)

Defined in: [scene/core/Resource.ts:13](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/Resource.ts#L13)

***

### type

> `readonly` **type**: `string`

Defined in: [scene/core/Resource.ts:11](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/Resource.ts#L11)

***

### uuid?

> `readonly` `optional` **uuid?**: `string`

Defined in: [scene/core/Resource.ts:12](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/Resource.ts#L12)

## Methods

### allocateResource()?

> `optional` **allocateResource**(`resourceManager`): `void` \| `Promise`\<`void`\>

Defined in: [scene/core/Resource.ts:15](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/Resource.ts#L15)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`void` \| `Promise`\<`void`\>

***

### disposeResource()?

> `optional` **disposeResource**(`resourceManager`): `void`

Defined in: [scene/core/Resource.ts:17](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/core/Resource.ts#L17)

#### Parameters

##### resourceManager

`ResourceManager`

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
