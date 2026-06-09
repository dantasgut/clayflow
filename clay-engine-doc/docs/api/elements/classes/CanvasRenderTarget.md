[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / CanvasRenderTarget

# Class: CanvasRenderTarget

Defined in: [elements/scene/RenderTarget.ts:34](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/scene/RenderTarget.ts#L34)

Render target que renderiza diretamente no canvas swapchain. Usado
pelo PostFlow no fim do chain (último effect escreve em canvasView).
`sizeFromCanvas: true` por default — atualiza automaticamente em resize.

## Extends

- [`Entity`](Entity.md)

## Implements

- `Resource`

## Constructors

### Constructor

> **new CanvasRenderTarget**(`options?`): `CanvasRenderTarget`

Defined in: [elements/scene/RenderTarget.ts:38](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/scene/RenderTarget.ts#L38)

#### Parameters

##### options?

[`RenderTargetOptions`](../interfaces/RenderTargetOptions.md) = `{}`

#### Returns

`CanvasRenderTarget`

#### Overrides

[`Entity`](Entity.md).[`constructor`](Entity.md#constructor)

## Properties

### data

> **data**: `Record`\<`string`, `unknown`\> = `{}`

Defined in: [elements/scene/RenderTarget.ts:36](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/scene/RenderTarget.ts#L36)

Dados runtime do resource (e.g. Camera position, Material albedo,
RigidBody mass). Schema é declarado em `getDescriptors()[i].schema`.
Mutações devem disparar evento `resourceDirty` para re-upload.

#### Implementation of

`Resource.data`

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/scene/RenderTarget.ts:35](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/scene/RenderTarget.ts#L35)

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

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/scene/RenderTarget.ts:51](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/scene/RenderTarget.ts#L51)

Render target não declara descriptors GPU — gerenciado pelo flow consumidor.

#### Returns

readonly `GPUDescriptor`[]

#### Implementation of

`Resource.getDescriptors`

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/scene/RenderTarget.ts:56](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/scene/RenderTarget.ts#L56)

Sem pipelines próprios.

#### Returns

readonly `PipelineDescriptor`[]

#### Implementation of

`Resource.getPipelineDescriptors`
