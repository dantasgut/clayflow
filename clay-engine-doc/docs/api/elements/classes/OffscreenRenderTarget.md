[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / OffscreenRenderTarget

# Class: OffscreenRenderTarget

Defined in: [elements/scene/RenderTarget.ts:66](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/scene/RenderTarget.ts#L66)

Render target offscreen — texture independente do canvas swapchain.
Usado para passes intermediários (shadow maps, refraction texture,
mirror reflection) que serão sampled em passes posteriores.

## Extends

- [`Entity`](Entity.md)

## Implements

- `Resource`

## Constructors

### Constructor

> **new OffscreenRenderTarget**(`options`): `OffscreenRenderTarget`

Defined in: [elements/scene/RenderTarget.ts:70](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/scene/RenderTarget.ts#L70)

#### Parameters

##### options

[`RenderTargetOptions`](../interfaces/RenderTargetOptions.md)

#### Returns

`OffscreenRenderTarget`

#### Overrides

[`Entity`](Entity.md).[`constructor`](Entity.md#constructor)

## Properties

### data

> **data**: `Record`\<`string`, `unknown`\> = `{}`

Defined in: [elements/scene/RenderTarget.ts:68](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/scene/RenderTarget.ts#L68)

Dados runtime do resource (e.g. Camera position, Material albedo,
RigidBody mass). Schema é declarado em `getDescriptors()[i].schema`.
Mutações devem disparar evento `resourceDirty` para re-upload.

#### Implementation of

`Resource.data`

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/scene/RenderTarget.ts:67](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/scene/RenderTarget.ts#L67)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

`Resource.state`

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

[`Entity`](Entity.md).[`attached`](Entity.md#attached)

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

[`Entity`](Entity.md).[`add`](Entity.md#add)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/scene/RenderTarget.ts:82](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/scene/RenderTarget.ts#L82)

Render target não declara descriptors GPU — gerenciado pelo flow consumidor.

#### Returns

readonly `GPUDescriptor`[]

#### Implementation of

`Resource.getDescriptors`

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/scene/RenderTarget.ts:87](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/scene/RenderTarget.ts#L87)

Sem pipelines próprios.

#### Returns

readonly `PipelineDescriptor`[]

#### Implementation of

`Resource.getPipelineDescriptors`
