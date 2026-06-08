[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ParametricSurfaceGeometry

# Class: ParametricSurfaceGeometry

Defined in: [elements/geometry/ParametricSurfaceGeometry.ts:4](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/geometry/ParametricSurfaceGeometry.ts#L4)

ParametricGeometry gera uma malha tessellated a partir de uma função
paramétrica `f(u, v) → [x, y, z]`. Útil para superfícies matemáticas
(sphere, torus, möbius, etc.) sem pré-computar mesh data.

Subdivisão é controlada por `uSteps × vSteps` (default 32×32 = 1024 quads).
Normais são placeholder (always [0, 1, 0]) — apps que precisam de
shading correto devem post-processar com derivada cross-product.

## Extends

- [`ParametricGeometry`](ParametricGeometry.md)

## Constructors

### Constructor

> **new ParametricSurfaceGeometry**(`fn`, `values?`): `ParametricSurfaceGeometry`

Defined in: [elements/geometry/ParametricSurfaceGeometry.ts:5](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/geometry/ParametricSurfaceGeometry.ts#L5)

#### Parameters

##### fn

[`ParametricFunction`](../type-aliases/ParametricFunction.md)

##### values?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`ParametricSurfaceGeometry`

#### Overrides

[`ParametricGeometry`](ParametricGeometry.md).[`constructor`](ParametricGeometry.md#constructor)

## Properties

### data

> **data**: `Record`\<`string`, `unknown`\> = `{}`

Defined in: [elements/geometry/Geometry.ts:9](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/geometry/Geometry.ts#L9)

Dados runtime do resource (e.g. Camera position, Material albedo,
RigidBody mass). Schema é declarado em `getDescriptors()[i].schema`.
Mutações devem disparar evento `resourceDirty` para re-upload.

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`data`](ParametricGeometry.md#data)

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/geometry/Geometry.ts:8](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/geometry/Geometry.ts#L8)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`state`](ParametricGeometry.md#state)

***

### schema

> `readonly` `static` **schema**: `StructSchema` = `ParametricGeometry.vertexStruct`

Defined in: [elements/geometry/ParametricGeometry.ts:34](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/geometry/ParametricGeometry.ts#L34)

Alias para vertexStruct — Schema interface comum.

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`schema`](ParametricGeometry.md#schema)

***

### vertexStruct

> `readonly` `static` **vertexStruct**: `StructSchema`

Defined in: [elements/geometry/ParametricGeometry.ts:28](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/geometry/ParametricGeometry.ts#L28)

Vertex layout: position (vec3) + normal (vec3) + uv (vec2).

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`vertexStruct`](ParametricGeometry.md#vertexstruct)

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

[`ParametricGeometry`](ParametricGeometry.md).[`attached`](ParametricGeometry.md#attached)

***

### indexCount

#### Get Signature

> **get** **indexCount**(): `number`

Defined in: [elements/geometry/ParametricGeometry.ts:70](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/geometry/ParametricGeometry.ts#L70)

Número total de índices (= uSteps × vSteps × 6, 2 triangles por quad).

##### Returns

`number`

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`indexCount`](ParametricGeometry.md#indexcount)

***

### vertexCount

#### Get Signature

> **get** **vertexCount**(): `number`

Defined in: [elements/geometry/ParametricGeometry.ts:66](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/geometry/ParametricGeometry.ts#L66)

Número total de vértices (= (uSteps+1) × (vSteps+1)).

##### Returns

`number`

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`vertexCount`](ParametricGeometry.md#vertexcount)

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

[`ParametricGeometry`](ParametricGeometry.md).[`add`](ParametricGeometry.md#add)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/geometry/ParametricGeometry.ts:53](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/geometry/ParametricGeometry.ts#L53)

Declara VBO (vertex buffer) + IBO (index buffer) para o ResourceSystem.

#### Returns

readonly `GPUDescriptor`[]

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`getDescriptors`](ParametricGeometry.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/geometry/Geometry.ts:13](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/geometry/Geometry.ts#L13)

Pipelines GPU declaradas pelo resource (shader source + entry points
+ consumes). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly `PipelineDescriptor`[]

#### Inherited from

[`ParametricGeometry`](ParametricGeometry.md).[`getPipelineDescriptors`](ParametricGeometry.md#getpipelinedescriptors)
