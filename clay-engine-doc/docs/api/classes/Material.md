[**webgpu-engine**](../README.md)

***

[webgpu-engine](../README.md) / Material

# Abstract Class: Material

Defined in: [scene/components/Material.ts:10](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Material.ts#L10)

Componente Lógico (ECS) representando a aparência (Shader + Material Data) do Nó.
Componente puro — não é um nó da cena. Deve ser adicionado a um Mesh.

## Extended by

- [`StandardMaterial`](StandardMaterial.md)
- [`WireframeMaterial`](WireframeMaterial.md)

## Implements

- [`Component`](../interfaces/Component.md)

## Constructors

### Constructor

> **new Material**(): `Material`

#### Returns

`Material`

## Properties

### bindGroupIds

> **bindGroupIds**: `string`[] = `[]`

Defined in: [scene/components/Material.ts:22](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Material.ts#L22)

***

### bindGroupSchema

> **bindGroupSchema**: `GPUBindGroupLayoutEntry`[] = `[]`

Defined in: [scene/components/Material.ts:23](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Material.ts#L23)

***

### doubleSided

> **doubleSided**: `boolean` = `false`

Defined in: [scene/components/Material.ts:24](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Material.ts#L24)

***

### layer

> `readonly` **layer**: [`VISUAL_COMPONENT`](../enumerations/ResourceType.md#visual_component) = `ResourceType.VISUAL_COMPONENT`

Defined in: [scene/components/Material.ts:14](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Material.ts#L14)

#### Implementation of

[`Component`](../interfaces/Component.md).[`layer`](../interfaces/Component.md#layer)

***

### rawUniforms

> **rawUniforms**: `Map`\<`string`, `Float32Array`\<`ArrayBufferLike`\>\>

Defined in: [scene/components/Material.ts:26](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Material.ts#L26)

***

### shaderId

> **shaderId**: `string` = `''`

Defined in: [scene/components/Material.ts:18](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Material.ts#L18)

***

### state

> **state**: [`ResourceState`](../enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [scene/components/Material.ts:17](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Material.ts#L17)

#### Implementation of

[`Component`](../interfaces/Component.md).[`state`](../interfaces/Component.md#state)

***

### topology

> **topology**: `GPUPrimitiveTopology` = `'triangle-list'`

Defined in: [scene/components/Material.ts:25](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Material.ts#L25)

***

### transparent

> **transparent**: `boolean` = `false`

Defined in: [scene/components/Material.ts:19](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Material.ts#L19)

***

### type

> `readonly` **type**: `string` = `'Material'`

Defined in: [scene/components/Material.ts:15](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Material.ts#L15)

#### Implementation of

[`Component`](../interfaces/Component.md).[`type`](../interfaces/Component.md#type)

***

### useVertexPulling

> **useVertexPulling**: `boolean` = `false`

Defined in: [scene/components/Material.ts:21](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Material.ts#L21)

Quando true, o renderer usa vertex pulling (lê VBO/IBO como storage buffers).

***

### uuid

> `readonly` **uuid**: `string`

Defined in: [scene/components/Material.ts:12](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Material.ts#L12)

#### Implementation of

[`Component`](../interfaces/Component.md).[`uuid`](../interfaces/Component.md#uuid)

## Methods

### allocateResource()

> **allocateResource**(`resourceManager`): `void`

Defined in: [scene/components/Material.ts:34](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Material.ts#L34)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`void`

#### Implementation of

[`Component`](../interfaces/Component.md).[`allocateResource`](../interfaces/Component.md#allocateresource)

***

### disposeResource()

> **disposeResource**(`resourceManager`): `void`

Defined in: [scene/components/Material.ts:66](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Material.ts#L66)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`void`

#### Implementation of

[`Component`](../interfaces/Component.md).[`disposeResource`](../interfaces/Component.md#disposeresource)

***

### markDirty()

> **markDirty**(): `void`

Defined in: [scene/components/Material.ts:28](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Material.ts#L28)

#### Returns

`void`

***

### updateResource()

> **updateResource**(`resourceManager`): `void`

Defined in: [scene/components/Material.ts:58](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/components/Material.ts#L58)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`void`

#### Implementation of

[`Component`](../interfaces/Component.md).[`updateResource`](../interfaces/Component.md#updateresource)
