[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / Time

# Class: Time

Defined in: [presentation/app/Time.ts:13](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/app/Time.ts#L13)

Resource Time — uniforme GPU com dt/elapsed/fixedDt/scale, atualizado
pelo GameLoop a cada frame. Shaders consomem via `consumes: ['Time']`.

## Extends

- [`Entity`](../../elements/classes/Entity.md)

## Implements

- `Resource`

## Constructors

### Constructor

> **new Time**(): `Time`

Defined in: [presentation/app/Time.ts:25](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/app/Time.ts#L25)

#### Returns

`Time`

#### Overrides

[`Entity`](../../elements/classes/Entity.md).[`constructor`](../../elements/classes/Entity.md#constructor)

## Properties

### data

> **data**: `Record`\<`string`, `unknown`\> = `{}`

Defined in: [presentation/app/Time.ts:23](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/app/Time.ts#L23)

Dados runtime do resource (e.g. Camera position, Material albedo,
RigidBody mass). Schema é declarado em `getDescriptors()[i].schema`.
Mutações devem disparar evento `resourceDirty` para re-upload.

#### Implementation of

`Resource.data`

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [presentation/app/Time.ts:22](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/app/Time.ts#L22)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

`Resource.state`

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [presentation/app/Time.ts:15](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/app/Time.ts#L15)

StructSchema do Time (4 floats: dt, elapsed, fixedDt, scale).

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](../../elements/classes/Entity.md)[]

Defined in: [scene/contracts/Entity.ts:41](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/scene/contracts/Entity.ts#L41)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](../../elements/classes/Entity.md)[]

#### Inherited from

[`Entity`](../../elements/classes/Entity.md).[`attached`](../../elements/classes/Entity.md#attached)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:32](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/scene/contracts/Entity.ts#L32)

Anexa uma Entity-filha. Retorna `this` para chaining fluente.
Não valida ciclos nem múltiplos pais — responsabilidade do caller.

#### Parameters

##### e

[`Entity`](../../elements/classes/Entity.md)

#### Returns

`this`

#### Inherited from

[`Entity`](../../elements/classes/Entity.md).[`add`](../../elements/classes/Entity.md#add)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [presentation/app/Time.ts:36](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/app/Time.ts#L36)

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

Defined in: [presentation/app/Time.ts:40](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/app/Time.ts#L40)

Pipelines GPU declaradas pelo resource (shader source + entry points
+ consumes). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly `PipelineDescriptor`[]

#### Implementation of

`Resource.getPipelineDescriptors`

***

### update()

> **update**(`dt`): `void`

Defined in: [presentation/app/Time.ts:31](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/app/Time.ts#L31)

Avança o tempo: atualiza dt e acumula em elapsed. Chamado pelo GameLoop.

#### Parameters

##### dt

`number`

#### Returns

`void`
