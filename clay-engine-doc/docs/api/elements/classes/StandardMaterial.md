[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / StandardMaterial

# Class: StandardMaterial

Defined in: [elements/material/StandardMaterial.ts:12](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/material/StandardMaterial.ts#L12)

Material PBR padrão — albedo + metallic-roughness. Renderizado pelo
`forward.wgsl` (BRDF Cook-Torrance simplificado).

## Extends

- [`Material`](Material.md)

## Constructors

### Constructor

> **new StandardMaterial**(`values?`): `StandardMaterial`

Defined in: [elements/material/StandardMaterial.ts:22](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/material/StandardMaterial.ts#L22)

#### Parameters

##### values?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`StandardMaterial`

#### Overrides

[`Material`](Material.md).[`constructor`](Material.md#constructor)

## Properties

### data

> **data**: `Record`\<`string`, `unknown`\> = `{}`

Defined in: [elements/material/Material.ts:9](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/material/Material.ts#L9)

Dados runtime do resource (e.g. Camera position, Material albedo,
RigidBody mass). Schema é declarado em `getDescriptors()[i].schema`.
Mutações devem disparar evento `resourceDirty` para re-upload.

#### Inherited from

[`Material`](Material.md).[`data`](Material.md#data)

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/material/Material.ts:8](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/material/Material.ts#L8)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`Material`](Material.md).[`state`](Material.md#state)

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/material/StandardMaterial.ts:14](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/material/StandardMaterial.ts#L14)

StructSchema do StandardMaterial (albedo + roughness + metallic).

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)[]

Defined in: [scene/contracts/Entity.ts:41](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/scene/contracts/Entity.ts#L41)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](Entity.md)[]

#### Inherited from

[`Material`](Material.md).[`attached`](Material.md#attached)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:32](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/scene/contracts/Entity.ts#L32)

Anexa uma Entity-filha. Retorna `this` para chaining fluente.
Não valida ciclos nem múltiplos pais — responsabilidade do caller.

#### Parameters

##### e

[`Entity`](Entity.md)

#### Returns

`this`

#### Inherited from

[`Material`](Material.md).[`add`](Material.md#add)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/material/StandardMaterial.ts:31](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/material/StandardMaterial.ts#L31)

Lista de bindings GPU (uniform/storage buffers, texturas, samplers)
que este resource expõe ao `ResourceSystem`. Cada descriptor define
`id`, `role`, `schema` (StructSchema) e opcionalmente `storage`
(`'pool'` para coalescer N members do mesmo schema em 1 buffer).

#### Returns

readonly `GPUDescriptor`[]

#### Overrides

[`Material`](Material.md).[`getDescriptors`](Material.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/material/StandardMaterial.ts:35](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/material/StandardMaterial.ts#L35)

Pipelines GPU declaradas pelo resource (shader source + entry points
+ consumes). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly `PipelineDescriptor`[]

#### Overrides

[`Material`](Material.md).[`getPipelineDescriptors`](Material.md#getpipelinedescriptors)
