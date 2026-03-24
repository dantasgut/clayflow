# Class: WireframeMaterial

Defined in: [elements/materials/WireframeMaterial.ts:24](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/materials/WireframeMaterial.ts#L24)

Material de wireframe espesso renderizado via vertex pulling. (Camada 3)

Usa o shader `thick-wireframe` com vertex pulling:
o renderer lê o VBO e IBO como storage buffers em @group(3) e emite
18 vértices por triângulo (3 arestas × 2 triângulos de quad × 3 vértices).
O desenvolvedor não precisa conhecer nenhum desses detalhes.

@group(2) @binding(0) — WireframeUniforms: color (vec4f) + lineWidth (f32) + padding

## Example

```ts
const box = new Mesh(
    new BoxGeometry(),
    new WireframeMaterial({ color: [0.2, 0.8, 0.4, 1], lineWidth: 2 }),
);
```

## Extends

- [`Material`](Material.md)

## Constructors

### Constructor

> **new WireframeMaterial**(`opts?`): `WireframeMaterial`

Defined in: [elements/materials/WireframeMaterial.ts:27](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/materials/WireframeMaterial.ts#L27)

#### Parameters

##### opts?

`WireframeMaterialOptions` = `{}`

#### Returns

`WireframeMaterial`

#### Overrides

[`Material`](Material.md).[`constructor`](Material.md#constructor)

## Properties

### bindGroupIds

> **bindGroupIds**: `string`[] = `[]`

Defined in: [scene/components/Material.ts:22](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Material.ts#L22)

#### Inherited from

[`Material`](Material.md).[`bindGroupIds`](Material.md#bindgroupids)

***

### bindGroupSchema

> **bindGroupSchema**: `GPUBindGroupLayoutEntry`[] = `[]`

Defined in: [scene/components/Material.ts:23](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Material.ts#L23)

#### Inherited from

[`Material`](Material.md).[`bindGroupSchema`](Material.md#bindgroupschema)

***

### doubleSided

> **doubleSided**: `boolean` = `false`

Defined in: [scene/components/Material.ts:24](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Material.ts#L24)

#### Inherited from

[`Material`](Material.md).[`doubleSided`](Material.md#doublesided)

***

### layer

> `readonly` **layer**: [`VISUAL_COMPONENT`](../enumerations/ResourceType.md#visual_component) = `ResourceType.VISUAL_COMPONENT`

Defined in: [scene/components/Material.ts:14](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Material.ts#L14)

#### Inherited from

[`Material`](Material.md).[`layer`](Material.md#layer)

***

### lineWidth

> **lineWidth**: `number`

Defined in: [elements/materials/WireframeMaterial.ts:25](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/materials/WireframeMaterial.ts#L25)

***

### rawUniforms

> **rawUniforms**: `Map`\<`string`, `Float32Array`\>

Defined in: [scene/components/Material.ts:26](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Material.ts#L26)

#### Inherited from

[`Material`](Material.md).[`rawUniforms`](Material.md#rawuniforms)

***

### shaderId

> **shaderId**: `string` = `''`

Defined in: [scene/components/Material.ts:18](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Material.ts#L18)

#### Inherited from

[`Material`](Material.md).[`shaderId`](Material.md#shaderid)

***

### state

> **state**: [`ResourceState`](../enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [scene/components/Material.ts:17](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Material.ts#L17)

#### Inherited from

[`Material`](Material.md).[`state`](Material.md#state)

***

### topology

> **topology**: `GPUPrimitiveTopology` = `'triangle-list'`

Defined in: [scene/components/Material.ts:25](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Material.ts#L25)

#### Inherited from

[`Material`](Material.md).[`topology`](Material.md#topology)

***

### transparent

> **transparent**: `boolean` = `false`

Defined in: [scene/components/Material.ts:19](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Material.ts#L19)

#### Inherited from

[`Material`](Material.md).[`transparent`](Material.md#transparent)

***

### type

> `readonly` **type**: `string` = `'Material'`

Defined in: [scene/components/Material.ts:15](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Material.ts#L15)

#### Inherited from

[`Material`](Material.md).[`type`](Material.md#type)

***

### useVertexPulling

> **useVertexPulling**: `boolean` = `false`

Defined in: [scene/components/Material.ts:21](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Material.ts#L21)

Quando true, o renderer usa vertex pulling (lê VBO/IBO como storage buffers).

#### Inherited from

[`Material`](Material.md).[`useVertexPulling`](Material.md#usevertexpulling)

***

### uuid

> `readonly` **uuid**: `string`

Defined in: [scene/components/Material.ts:12](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Material.ts#L12)

#### Inherited from

[`Material`](Material.md).[`uuid`](Material.md#uuid)

## Methods

### allocateResource()

> **allocateResource**(`resourceManager`): `void`

Defined in: [scene/components/Material.ts:34](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Material.ts#L34)

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

Defined in: [scene/components/Material.ts:66](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Material.ts#L66)

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

Defined in: [scene/components/Material.ts:28](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Material.ts#L28)

#### Returns

`void`

#### Inherited from

[`Material`](Material.md).[`markDirty`](Material.md#markdirty)

***

### updateResource()

> **updateResource**(`resourceManager`): `void`

Defined in: [scene/components/Material.ts:58](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/Material.ts#L58)

#### Parameters

##### resourceManager

`ResourceManager`

#### Returns

`void`

#### Inherited from

[`Material`](Material.md).[`updateResource`](Material.md#updateresource)
