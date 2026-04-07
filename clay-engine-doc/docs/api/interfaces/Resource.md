# Interface: Resource

Defined in: [scene/core/Resource.ts:11](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/core/Resource.ts#L11)

Interface mestre para qualquer nó/elemento estrutural da Engine que possua 
um estado de memória e possa transferir dados para a Placa de Vídeo (VRAM).
- "Componentes Visuais" repassam essa interface.
- "Corpos Lógicos Físicos" implementam isso diretamente.

## Extended by

- [`Component`](Component.md)

## Properties

### currentResourceState?

> `readonly` `optional` **currentResourceState?**: `ResourceStateHandler`

Defined in: [scene/core/Resource.ts:17](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/core/Resource.ts#L17)

Handler do estado atual — consulta de capacidades pelos consumidores.

***

### state?

> `optional` **state?**: [`ResourceState`](../enumerations/ResourceState.md)

Defined in: [scene/core/Resource.ts:14](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/core/Resource.ts#L14)

***

### type

> `readonly` **type**: `string`

Defined in: [scene/core/Resource.ts:12](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/core/Resource.ts#L12)

***

### uuid?

> `readonly` `optional` **uuid?**: `string`

Defined in: [scene/core/Resource.ts:13](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/core/Resource.ts#L13)

## Methods

### allocateResource()?

> `optional` **allocateResource**(`resourceManager`): `void` \| `Promise`\<`void`\>

Defined in: [scene/core/Resource.ts:19](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/core/Resource.ts#L19)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`void` \| `Promise`\<`void`\>

***

### disposeResource()?

> `optional` **disposeResource**(`resourceManager`): `void`

Defined in: [scene/core/Resource.ts:21](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/core/Resource.ts#L21)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`void`

***

### updateResource()?

> `optional` **updateResource**(`resourceManager`): `void` \| `Promise`\<`void`\>

Defined in: [scene/core/Resource.ts:20](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/core/Resource.ts#L20)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`void` \| `Promise`\<`void`\>
