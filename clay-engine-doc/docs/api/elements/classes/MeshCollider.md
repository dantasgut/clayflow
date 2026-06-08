[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / MeshCollider

# Class: MeshCollider

Defined in: [elements/physics/colliders/MeshCollider.ts:10](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/colliders/MeshCollider.ts#L10)

Collider triangle-mesh estático — referencia faixa do triangle pool
(firstTriangle + triangleCount). Para shapes deformáveis, use SoftBody.

## Extends

- [`Collider`](Collider.md)

## Constructors

### Constructor

> **new MeshCollider**(`values?`): `MeshCollider`

Defined in: [elements/physics/colliders/MeshCollider.ts:19](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/colliders/MeshCollider.ts#L19)

#### Parameters

##### values?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`MeshCollider`

#### Overrides

[`Collider`](Collider.md).[`constructor`](Collider.md#constructor)

## Properties

### data

> **data**: `Record`\<`string`, `unknown`\> = `{}`

Defined in: [elements/physics/colliders/Collider.ts:9](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/colliders/Collider.ts#L9)

Dados runtime do resource (e.g. Camera position, Material albedo,
RigidBody mass). Schema é declarado em `getDescriptors()[i].schema`.
Mutações devem disparar evento `resourceDirty` para re-upload.

#### Inherited from

[`Collider`](Collider.md).[`data`](Collider.md#data)

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/physics/colliders/Collider.ts:8](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/colliders/Collider.ts#L8)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`Collider`](Collider.md).[`state`](Collider.md#state)

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/physics/colliders/MeshCollider.ts:12](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/colliders/MeshCollider.ts#L12)

StructSchema do MeshCollider (triangleCount + firstTriangle).

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

[`Collider`](Collider.md).[`attached`](Collider.md#attached)

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

[`Collider`](Collider.md).[`add`](Collider.md#add)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/physics/colliders/MeshCollider.ts:29](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/colliders/MeshCollider.ts#L29)

Lista de bindings GPU (uniform/storage buffers, texturas, samplers)
que este resource expõe ao `ResourceSystem`. Cada descriptor define
`id`, `role`, `schema` (StructSchema) e opcionalmente `storage`
(`'pool'` para coalescer N members do mesmo schema em 1 buffer).

#### Returns

readonly `GPUDescriptor`[]

#### Overrides

[`Collider`](Collider.md).[`getDescriptors`](Collider.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/physics/colliders/Collider.ts:13](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/colliders/Collider.ts#L13)

Pipelines GPU declaradas pelo resource (shader source + entry points
+ consumes). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly `PipelineDescriptor`[]

#### Inherited from

[`Collider`](Collider.md).[`getPipelineDescriptors`](Collider.md#getpipelinedescriptors)
