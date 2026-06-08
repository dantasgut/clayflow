[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / PointCloudGeometry

# Class: PointCloudGeometry

Defined in: [elements/geometry/PointCloudGeometry.ts:12](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/geometry/PointCloudGeometry.ts#L12)

Point cloud — array de pontos como geometry. Cada ponto tem position +
normal (para shading point-sprite). Usado por particle systems e
scientific visualization.

## Extends

- [`Geometry`](Geometry.md)

## Constructors

### Constructor

> **new PointCloudGeometry**(`values?`): `PointCloudGeometry`

Defined in: [elements/geometry/PointCloudGeometry.ts:19](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/geometry/PointCloudGeometry.ts#L19)

#### Parameters

##### values?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`PointCloudGeometry`

#### Overrides

[`Geometry`](Geometry.md).[`constructor`](Geometry.md#constructor)

## Properties

### data

> **data**: `Record`\<`string`, `unknown`\> = `{}`

Defined in: [elements/geometry/Geometry.ts:9](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/geometry/Geometry.ts#L9)

Dados runtime do resource (e.g. Camera position, Material albedo,
RigidBody mass). Schema é declarado em `getDescriptors()[i].schema`.
Mutações devem disparar evento `resourceDirty` para re-upload.

#### Inherited from

[`Geometry`](Geometry.md).[`data`](Geometry.md#data)

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/geometry/Geometry.ts:8](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/geometry/Geometry.ts#L8)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`Geometry`](Geometry.md).[`state`](Geometry.md#state)

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/geometry/PointCloudGeometry.ts:14](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/geometry/PointCloudGeometry.ts#L14)

StructSchema do ponto (position + normal, 32 bytes).

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

[`Geometry`](Geometry.md).[`attached`](Geometry.md#attached)

***

### indexCount

#### Get Signature

> **get** **indexCount**(): `number`

Defined in: [elements/geometry/PointCloudGeometry.ts:45](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/geometry/PointCloudGeometry.ts#L45)

Point clouds não usam index buffer — sempre 0.

##### Returns

`number`

#### Overrides

[`Geometry`](Geometry.md).[`indexCount`](Geometry.md#indexcount)

***

### vertexCount

#### Get Signature

> **get** **vertexCount**(): `number`

Defined in: [elements/geometry/PointCloudGeometry.ts:41](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/geometry/PointCloudGeometry.ts#L41)

Número de pontos no buffer (sempre = `maxParticles`).

##### Returns

`number`

#### Overrides

[`Geometry`](Geometry.md).[`vertexCount`](Geometry.md#vertexcount)

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

[`Geometry`](Geometry.md).[`add`](Geometry.md#add)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/geometry/PointCloudGeometry.ts:25](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/geometry/PointCloudGeometry.ts#L25)

Lista de bindings GPU (uniform/storage buffers, texturas, samplers)
que este resource expõe ao `ResourceSystem`. Cada descriptor define
`id`, `role`, `schema` (StructSchema) e opcionalmente `storage`
(`'pool'` para coalescer N members do mesmo schema em 1 buffer).

#### Returns

readonly `GPUDescriptor`[]

#### Overrides

[`Geometry`](Geometry.md).[`getDescriptors`](Geometry.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/geometry/PointCloudGeometry.ts:36](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/geometry/PointCloudGeometry.ts#L36)

Pipelines GPU declaradas pelo resource (shader source + entry points
+ consumes). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly `PipelineDescriptor`[]

#### Overrides

[`Geometry`](Geometry.md).[`getPipelineDescriptors`](Geometry.md#getpipelinedescriptors)
