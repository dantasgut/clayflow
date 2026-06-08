[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / PointLight

# Class: PointLight

Defined in: [elements/scene/PointLight.ts:3](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/scene/PointLight.ts#L3)

Light é a base de todos os tipos de luz (DirectionalLight, PointLight,
SpotLight). Compartilham um struct comum coalescível em pool — múltiplas
lights são lidas simultaneamente por shaders no fragment stage.

`kind` enum interno: 0 = directional, 1 = point, 2 = spot.

## Extends

- [`Light`](Light.md)

## Constructors

### Constructor

> **new PointLight**(`values?`): `PointLight`

Defined in: [elements/scene/PointLight.ts:4](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/scene/PointLight.ts#L4)

#### Parameters

##### values?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`PointLight`

#### Overrides

[`Light`](Light.md).[`constructor`](Light.md#constructor)

## Properties

### data

> **data**: `Record`\<`string`, `unknown`\> = `{}`

Defined in: [elements/scene/Light.ts:29](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/scene/Light.ts#L29)

Dados runtime do resource (e.g. Camera position, Material albedo,
RigidBody mass). Schema é declarado em `getDescriptors()[i].schema`.
Mutações devem disparar evento `resourceDirty` para re-upload.

#### Inherited from

[`Light`](Light.md).[`data`](Light.md#data)

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/scene/Light.ts:28](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/scene/Light.ts#L28)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`Light`](Light.md).[`state`](Light.md#state)

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/scene/Light.ts:18](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/scene/Light.ts#L18)

Schema unified — todos os tipos de light usam o mesmo layout.

#### Inherited from

[`Light`](Light.md).[`schema`](Light.md#schema)

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

[`Light`](Light.md).[`attached`](Light.md#attached)

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

[`Light`](Light.md).[`add`](Light.md#add)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/scene/Light.ts:32](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/scene/Light.ts#L32)

Pool storage read-only — fragment shaders iteram sobre o array de lights.

#### Returns

readonly `GPUDescriptor`[]

#### Inherited from

[`Light`](Light.md).[`getDescriptors`](Light.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/scene/Light.ts:44](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/scene/Light.ts#L44)

Sem pipelines próprios — Light é dado, ForwardFlow é quem itera.

#### Returns

readonly `PipelineDescriptor`[]

#### Inherited from

[`Light`](Light.md).[`getPipelineDescriptors`](Light.md#getpipelinedescriptors)
