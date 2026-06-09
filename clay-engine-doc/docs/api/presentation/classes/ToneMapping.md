[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ToneMapping

# Class: ToneMapping

Defined in: [presentation/flows/effects/ToneMapping.ts:3](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/effects/ToneMapping.ts#L3)

PostProcessEffect é a base de todos os post-process passes do PostFlow.
Cada effect contribui com 1 fragment entry point + 16 bytes de uniform
(strength + aux). PostFlow encadeia os effects ativos via ping-pong de
texturas: scene → pp[0] → pp[1] → ... → canvas.

Built-in effects: Bloom, Blur, ChromaticAberration, ColorGrading, Fxaa,
Ssao, ToneMapping, Vignette. Custom effects: implemente `fragmentSource()`
retornando WGSL próprio (ver método).

Subclasses devem implementar `name` (identificador) e `fragmentEntry`
(nome do fragment fn no WGSL).

## Extends

- [`PostProcessEffect`](PostProcessEffect.md)

## Constructors

### Constructor

> **new ToneMapping**(`options?`): `ToneMapping`

Defined in: [presentation/resources/PostProcessEffect.ts:44](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/resources/PostProcessEffect.ts#L44)

#### Parameters

##### options?

[`PostProcessOptions`](../interfaces/PostProcessOptions.md) = `{}`

#### Returns

`ToneMapping`

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`constructor`](PostProcessEffect.md#constructor)

## Properties

### data

> **data**: `Record`\<`string`, `unknown`\> = `{}`

Defined in: [presentation/resources/PostProcessEffect.ts:42](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/resources/PostProcessEffect.ts#L42)

Dados runtime do resource (e.g. Camera position, Material albedo,
RigidBody mass). Schema é declarado em `getDescriptors()[i].schema`.
Mutações devem disparar evento `resourceDirty` para re-upload.

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`data`](PostProcessEffect.md#data)

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [presentation/resources/PostProcessEffect.ts:41](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/resources/PostProcessEffect.ts#L41)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`state`](PostProcessEffect.md#state)

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](../../elements/classes/Entity.md)[]

Defined in: [scene/contracts/Entity.ts:41](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/scene/contracts/Entity.ts#L41)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](../../elements/classes/Entity.md)[]

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`attached`](PostProcessEffect.md#attached)

***

### fragmentEntry

#### Get Signature

> **get** **fragmentEntry**(): `string`

Defined in: [presentation/flows/effects/ToneMapping.ts:7](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/effects/ToneMapping.ts#L7)

Nome do fragment entry point no WGSL (e.g. 'fs_bloom').

##### Returns

`string`

#### Overrides

[`PostProcessEffect`](PostProcessEffect.md).[`fragmentEntry`](PostProcessEffect.md#fragmententry)

***

### isEnabled

#### Get Signature

> **get** **isEnabled**(): `boolean`

Defined in: [presentation/resources/PostProcessEffect.ts:73](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/resources/PostProcessEffect.ts#L73)

True se o effect deve participar do chain neste frame. Lê `data.enabled`.

##### Returns

`boolean`

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`isEnabled`](PostProcessEffect.md#isenabled)

***

### name

#### Get Signature

> **get** **name**(): `string`

Defined in: [presentation/flows/effects/ToneMapping.ts:4](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/effects/ToneMapping.ts#L4)

Nome único do effect (e.g. 'bloom', 'fxaa'). Usado em discriminator de pipeline/buffer.

##### Returns

`string`

#### Overrides

[`PostProcessEffect`](PostProcessEffect.md).[`name`](PostProcessEffect.md#name)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:32](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/scene/contracts/Entity.ts#L32)

Anexa uma Entity-filha. Retorna `this` para chaining fluente.
Não valida ciclos nem múltiplos pais — responsabilidade do caller.

#### Parameters

##### e

[`Entity`](../../elements/classes/Entity.md)

#### Returns

`this`

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`add`](PostProcessEffect.md#add)

***

### fragmentSource()?

> `optional` **fragmentSource**(): `string`

Defined in: [presentation/resources/PostProcessEffect.ts:70](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/resources/PostProcessEffect.ts#L70)

Override opcional: retorna WGSL source customizado contendo o
fragment entry point (`fragmentEntry`). Quando definido, PostFlow cria
um `ShaderModuleSpec` dedicado para este effect em vez de usar o
`effects.wgsl` monolítico. Útil para custom effects sem editar a engine.

O source DEVE também conter um vertex entry — ou reutilizar
`vs_fullscreen` do effects.wgsl via concatenação se desejar:
```ts
fragmentSource() { return effectsBase + this.customFs; }
```

#### Returns

`string`

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`fragmentSource`](PostProcessEffect.md#fragmentsource)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [presentation/resources/PostProcessEffect.ts:94](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/resources/PostProcessEffect.ts#L94)

Effects não declaram GPUDescriptors — params buffer é gerenciado pelo PostFlow.

#### Returns

readonly `GPUDescriptor`[]

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`getDescriptors`](PostProcessEffect.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [presentation/resources/PostProcessEffect.ts:98](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/resources/PostProcessEffect.ts#L98)

Effects não declaram PipelineDescriptors — PostFlow cria via `paramsBytes` + shader.

#### Returns

readonly `PipelineDescriptor`[]

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`getPipelineDescriptors`](PostProcessEffect.md#getpipelinedescriptors)

***

### paramsBytes()

> **paramsBytes**(): `Uint8Array`

Defined in: [presentation/resources/PostProcessEffect.ts:82](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/resources/PostProcessEffect.ts#L82)

Serializa `strength + aux` em 16 bytes para upload no uniform buffer
do effect. Override para layouts custom — mas mantenha 16 bytes para
compatibilidade com o pipeline padrão.

#### Returns

`Uint8Array`

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`paramsBytes`](PostProcessEffect.md#paramsbytes)
