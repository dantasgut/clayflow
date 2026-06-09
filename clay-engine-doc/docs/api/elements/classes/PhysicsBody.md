[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / PhysicsBody

# Abstract Class: PhysicsBody

Defined in: [elements/physics/bodies/PhysicsBody.ts:14](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/physics/bodies/PhysicsBody.ts#L14)

Base abstrata dos physics bodies. Data class pura: armazena estado em
`data` governado pelo schema escolhido na instanciação. O algoritmo
integrador vive no Flow (importa o WGSL kernel); o body apenas declara
descriptors de buffer/pool. Roteamento body→flow é por `schema.name`
(pool key) que casa com `Flow.bodyType` registrado no FlowRegistry.

## Extends

- [`Entity`](Entity.md)

## Extended by

- [`RigidBody`](RigidBody.md)
- [`SoftBody`](SoftBody.md)
- [`FluidBody`](FluidBody.md)

## Implements

- `Resource`

## Constructors

### Constructor

> **new PhysicsBody**(): `PhysicsBody`

#### Returns

`PhysicsBody`

#### Inherited from

[`Entity`](Entity.md).[`constructor`](Entity.md#constructor)

## Properties

### data

> **data**: `Record`\<`string`, `unknown`\> = `{}`

Defined in: [elements/physics/bodies/PhysicsBody.ts:16](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/physics/bodies/PhysicsBody.ts#L16)

Dados runtime do resource (e.g. Camera position, Material albedo,
RigidBody mass). Schema é declarado em `getDescriptors()[i].schema`.
Mutações devem disparar evento `resourceDirty` para re-upload.

#### Implementation of

`Resource.data`

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/physics/bodies/PhysicsBody.ts:15](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/physics/bodies/PhysicsBody.ts#L15)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

`Resource.state`

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)[]

Defined in: [scene/contracts/Entity.ts:41](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/scene/contracts/Entity.ts#L41)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](Entity.md)[]

#### Inherited from

[`Entity`](Entity.md).[`attached`](Entity.md#attached)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:32](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/scene/contracts/Entity.ts#L32)

Anexa uma Entity-filha. Retorna `this` para chaining fluente.
Não valida ciclos nem múltiplos pais — responsabilidade do caller.

#### Parameters

##### e

[`Entity`](Entity.md)

#### Returns

`this`

#### Inherited from

[`Entity`](Entity.md).[`add`](Entity.md#add)

***

### getDescriptors()

> `abstract` **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/physics/bodies/PhysicsBody.ts:18](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/physics/bodies/PhysicsBody.ts#L18)

Lista de bindings GPU (uniform/storage buffers, texturas, samplers)
que este resource expõe ao `ResourceSystem`. Cada descriptor define
`id`, `role`, `schema` (StructSchema) e opcionalmente `storage`
(`'pool'` para coalescer N members do mesmo schema em 1 buffer).

#### Returns

readonly `GPUDescriptor`[]

#### Implementation of

`Resource.getDescriptors`

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/physics/bodies/PhysicsBody.ts:20](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/physics/bodies/PhysicsBody.ts#L20)

Pipelines GPU declaradas pelo resource (shader source + entry points
+ consumes). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly `PipelineDescriptor`[]

#### Implementation of

`Resource.getPipelineDescriptors`
