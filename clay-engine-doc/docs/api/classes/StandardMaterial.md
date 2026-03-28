# Class: StandardMaterial

Defined in: [elements/materials/StandardMaterial.ts:14](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/elements/materials/StandardMaterial.ts#L14)

Material Padrão Simples da Camada 3.
É um Builder que configura as propriedades iniciais na RAM.

## Extends

- [`Material`](Material.md)

## Constructors

### Constructor

> **new StandardMaterial**(`options?`): `StandardMaterial`

Defined in: [elements/materials/StandardMaterial.ts:20](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/elements/materials/StandardMaterial.ts#L20)

#### Parameters

##### options?

`StandardMaterialOptions` = `{}`

#### Returns

`StandardMaterial`

#### Overrides

[`Material`](Material.md).[`constructor`](Material.md#constructor)

## Properties

### bindGroupIds

> **bindGroupIds**: `string`[] = `[]`

Defined in: [scene/components/Material.ts:29](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Material.ts#L29)

#### Inherited from

[`Material`](Material.md).[`bindGroupIds`](Material.md#bindgroupids)

***

### bindGroupSchema

> **bindGroupSchema**: `GPUBindGroupLayoutEntry`[] = `[]`

Defined in: [scene/components/Material.ts:30](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Material.ts#L30)

#### Inherited from

[`Material`](Material.md).[`bindGroupSchema`](Material.md#bindgroupschema)

***

### color

> **color**: \[`number`, `number`, `number`, `number`\]

Defined in: [elements/materials/StandardMaterial.ts:15](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/elements/materials/StandardMaterial.ts#L15)

***

### doubleSided

> **doubleSided**: `boolean` = `false`

Defined in: [scene/components/Material.ts:31](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Material.ts#L31)

#### Inherited from

[`Material`](Material.md).[`doubleSided`](Material.md#doublesided)

***

### emissive

> **emissive**: \[`number`, `number`, `number`\]

Defined in: [elements/materials/StandardMaterial.ts:16](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/elements/materials/StandardMaterial.ts#L16)

***

### layer

> `readonly` **layer**: [`VISUAL_COMPONENT`](../enumerations/ResourceType.md#visual_component) = `ResourceType.VISUAL_COMPONENT`

Defined in: [scene/components/Material.ts:16](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Material.ts#L16)

#### Inherited from

[`Material`](Material.md).[`layer`](Material.md#layer)

***

### metallic

> **metallic**: `number`

Defined in: [elements/materials/StandardMaterial.ts:18](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/elements/materials/StandardMaterial.ts#L18)

***

### rawUniforms

> **rawUniforms**: `Map`\<`string`, `Float32Array`\>

Defined in: [scene/components/Material.ts:33](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Material.ts#L33)

#### Inherited from

[`Material`](Material.md).[`rawUniforms`](Material.md#rawuniforms)

***

### roughness

> **roughness**: `number`

Defined in: [elements/materials/StandardMaterial.ts:17](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/elements/materials/StandardMaterial.ts#L17)

***

### shaderId

> **shaderId**: `string` = `''`

Defined in: [scene/components/Material.ts:25](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Material.ts#L25)

#### Inherited from

[`Material`](Material.md).[`shaderId`](Material.md#shaderid)

***

### state

> **state**: [`ResourceState`](../enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [scene/components/Material.ts:19](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Material.ts#L19)

#### Inherited from

[`Material`](Material.md).[`state`](Material.md#state)

***

### topology

> **topology**: `GPUPrimitiveTopology` = `'triangle-list'`

Defined in: [scene/components/Material.ts:32](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Material.ts#L32)

#### Inherited from

[`Material`](Material.md).[`topology`](Material.md#topology)

***

### transparent

> **transparent**: `boolean` = `false`

Defined in: [scene/components/Material.ts:26](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Material.ts#L26)

#### Inherited from

[`Material`](Material.md).[`transparent`](Material.md#transparent)

***

### type

> `readonly` **type**: `string` = `'Material'`

Defined in: [scene/components/Material.ts:17](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Material.ts#L17)

#### Inherited from

[`Material`](Material.md).[`type`](Material.md#type)

***

### useVertexPulling

> **useVertexPulling**: `boolean` = `false`

Defined in: [scene/components/Material.ts:28](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Material.ts#L28)

Quando true, o renderer usa vertex pulling (lê VBO/IBO como storage buffers).

#### Inherited from

[`Material`](Material.md).[`useVertexPulling`](Material.md#usevertexpulling)

***

### uuid

> `readonly` **uuid**: `string`

Defined in: [scene/components/Material.ts:14](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Material.ts#L14)

#### Inherited from

[`Material`](Material.md).[`uuid`](Material.md#uuid)

## Accessors

### currentResourceState

#### Get Signature

> **get** **currentResourceState**(): `ResourceStateHandler`

Defined in: [scene/components/Material.ts:22](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Material.ts#L22)

Handler do estado atual — encapsula capacidades do ciclo de vida GPU.

##### Returns

`ResourceStateHandler`

Handler do estado atual — consulta de capacidades pelos consumidores.

#### Inherited from

[`Material`](Material.md).[`currentResourceState`](Material.md#currentresourcestate)

## Methods

### allocateResource()

> **allocateResource**(`resourceManager`): `void`

Defined in: [scene/components/Material.ts:40](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Material.ts#L40)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`void`

#### Inherited from

[`Material`](Material.md).[`allocateResource`](Material.md#allocateresource)

***

### disposeResource()

> **disposeResource**(`resourceManager`): `void`

Defined in: [scene/components/Material.ts:72](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Material.ts#L72)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`void`

#### Inherited from

[`Material`](Material.md).[`disposeResource`](Material.md#disposeresource)

***

### markDirty()

> **markDirty**(): `void`

Defined in: [scene/components/Material.ts:35](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Material.ts#L35)

#### Returns

`void`

#### Inherited from

[`Material`](Material.md).[`markDirty`](Material.md#markdirty)

***

### updateResource()

> **updateResource**(`resourceManager`): `void`

Defined in: [scene/components/Material.ts:64](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/Material.ts#L64)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`void`

#### Inherited from

[`Material`](Material.md).[`updateResource`](Material.md#updateresource)
