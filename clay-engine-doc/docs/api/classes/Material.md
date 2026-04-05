# Abstract Class: Material

Defined in: [scene/components/Material.ts:12](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/Material.ts#L12)

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

Defined in: [scene/components/Material.ts:29](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/Material.ts#L29)

***

### bindGroupSchema

> **bindGroupSchema**: `GPUBindGroupLayoutEntry`[] = `[]`

Defined in: [scene/components/Material.ts:30](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/Material.ts#L30)

***

### doubleSided

> **doubleSided**: `boolean` = `false`

Defined in: [scene/components/Material.ts:31](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/Material.ts#L31)

***

### layer

> `readonly` **layer**: [`VISUAL_COMPONENT`](../enumerations/ResourceType.md#visual_component) = `ResourceType.VISUAL_COMPONENT`

Defined in: [scene/components/Material.ts:16](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/Material.ts#L16)

#### Implementation of

[`Component`](../interfaces/Component.md).[`layer`](../interfaces/Component.md#layer)

***

### rawUniforms

> **rawUniforms**: `Map`\<`string`, `Float32Array`\>

Defined in: [scene/components/Material.ts:33](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/Material.ts#L33)

***

### shaderId

> **shaderId**: `string` = `''`

Defined in: [scene/components/Material.ts:25](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/Material.ts#L25)

***

### state

> **state**: [`ResourceState`](../enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [scene/components/Material.ts:19](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/Material.ts#L19)

#### Implementation of

[`Component`](../interfaces/Component.md).[`state`](../interfaces/Component.md#state)

***

### topology

> **topology**: `GPUPrimitiveTopology` = `'triangle-list'`

Defined in: [scene/components/Material.ts:32](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/Material.ts#L32)

***

### transparent

> **transparent**: `boolean` = `false`

Defined in: [scene/components/Material.ts:26](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/Material.ts#L26)

***

### type

> `readonly` **type**: `string` = `'Material'`

Defined in: [scene/components/Material.ts:17](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/Material.ts#L17)

#### Implementation of

[`Component`](../interfaces/Component.md).[`type`](../interfaces/Component.md#type)

***

### useVertexPulling

> **useVertexPulling**: `boolean` = `false`

Defined in: [scene/components/Material.ts:28](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/Material.ts#L28)

Quando true, o renderer usa vertex pulling (lê VBO/IBO como storage buffers).

***

### uuid

> `readonly` **uuid**: `string`

Defined in: [scene/components/Material.ts:14](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/Material.ts#L14)

#### Implementation of

[`Component`](../interfaces/Component.md).[`uuid`](../interfaces/Component.md#uuid)

## Accessors

### currentResourceState

#### Get Signature

> **get** **currentResourceState**(): `ResourceStateHandler`

Defined in: [scene/components/Material.ts:22](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/Material.ts#L22)

Handler do estado atual — encapsula capacidades do ciclo de vida GPU.

##### Returns

`ResourceStateHandler`

Handler do estado atual — consulta de capacidades pelos consumidores.

#### Implementation of

[`Component`](../interfaces/Component.md).[`currentResourceState`](../interfaces/Component.md#currentresourcestate)

## Methods

### allocateResource()

> **allocateResource**(`resourceManager`): `void`

Defined in: [scene/components/Material.ts:40](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/Material.ts#L40)

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

Defined in: [scene/components/Material.ts:72](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/Material.ts#L72)

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

Defined in: [scene/components/Material.ts:35](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/Material.ts#L35)

#### Returns

`void`

***

### updateResource()

> **updateResource**(`resourceManager`): `void`

Defined in: [scene/components/Material.ts:64](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/components/Material.ts#L64)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`void`

#### Implementation of

[`Component`](../interfaces/Component.md).[`updateResource`](../interfaces/Component.md#updateresource)
