[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / PostProcessEffect

# Abstract Class: PostProcessEffect

Defined in: [presentation/resources/PostProcessEffect.ts:42](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/resources/PostProcessEffect.ts#L42)

PostProcessEffect é a base de todos os post-process passes do PostFlow.
Cada effect contribui com 1 fragment entry point + 16 bytes de uniform
(strength + aux). PostFlow encadeia os effects ativos via ping-pong de
texturas: scene → pp[0] → pp[1] → ... → canvas.

Built-in effects: Bloom, Blur, ChromaticAberration, ColorGrading, Fxaa,
Ssao, ToneMapping, Vignette. Custom effects: implemente `fragmentModule()`
retornando um módulo WGSL próprio (ver método).

Subclasses devem implementar `name` (identificador) e `fragmentEntry`
(nome do fragment fn no WGSL).

## Extends

- [`Entity`](../../elements/classes/Entity.md)

## Extended by

- [`Bloom`](Bloom.md)
- [`Blur`](Blur.md)
- [`ToneMapping`](ToneMapping.md)
- [`Fxaa`](Fxaa.md)
- [`Ssao`](Ssao.md)
- [`Vignette`](Vignette.md)
- [`ChromaticAberration`](ChromaticAberration.md)
- [`ColorGrading`](ColorGrading.md)

## Implements

- `Resource`

## Constructors

### Constructor

> **new PostProcessEffect**(`options?`): `PostProcessEffect`

Defined in: [presentation/resources/PostProcessEffect.ts:46](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/resources/PostProcessEffect.ts#L46)

#### Parameters

##### options?

[`PostProcessOptions`](../interfaces/PostProcessOptions.md) = `{}`

#### Returns

`PostProcessEffect`

#### Overrides

[`Entity`](../../elements/classes/Entity.md).[`constructor`](../../elements/classes/Entity.md#constructor)

## Properties

### data

> **data**: `Record`\<`string`, `unknown`\> = `{}`

Defined in: [presentation/resources/PostProcessEffect.ts:44](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/resources/PostProcessEffect.ts#L44)

Dados runtime do resource (e.g. Camera position, Material albedo,
RigidBody mass). Schema é declarado em `getDescriptors()[i].schema`.
Mutações devem disparar evento `resourceDirty` para re-upload.

#### Implementation of

`Resource.data`

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [presentation/resources/PostProcessEffect.ts:43](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/resources/PostProcessEffect.ts#L43)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

`Resource.state`

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](../../elements/classes/Entity.md)[]

Defined in: [scene/contracts/Entity.ts:41](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/contracts/Entity.ts#L41)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](../../elements/classes/Entity.md)[]

#### Inherited from

[`Entity`](../../elements/classes/Entity.md).[`attached`](../../elements/classes/Entity.md#attached)

***

### fragmentEntry

#### Get Signature

> **get** `abstract` **fragmentEntry**(): `string`

Defined in: [presentation/resources/PostProcessEffect.ts:58](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/resources/PostProcessEffect.ts#L58)

Nome do fragment entry point no WGSL (e.g. 'fs_bloom').

##### Returns

`string`

***

### isEnabled

#### Get Signature

> **get** **isEnabled**(): `boolean`

Defined in: [presentation/resources/PostProcessEffect.ts:73](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/resources/PostProcessEffect.ts#L73)

True se o effect deve participar do chain neste frame. Lê `data.enabled`.

##### Returns

`boolean`

***

### name

#### Get Signature

> **get** `abstract` **name**(): `string`

Defined in: [presentation/resources/PostProcessEffect.ts:56](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/resources/PostProcessEffect.ts#L56)

Nome único do effect (e.g. 'bloom', 'fxaa'). Usado em discriminator de pipeline/buffer.

##### Returns

`string`

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:32](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/contracts/Entity.ts#L32)

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

### fragmentModule()?

> `optional` **fragmentModule**(): `WgslModule`

Defined in: [presentation/resources/PostProcessEffect.ts:70](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/resources/PostProcessEffect.ts#L70)

Override opcional: módulo WGSL próprio contendo o fragment entry point (`fragmentEntry`). Quando definido, o
PostFlow monta um shader dedicado para este effect em vez de usar o comum. O módulo declara
`requires: [effectsBase]` para reutilizar os bindings e o `vs_fullscreen`:
```ts
fragmentModule() {
    return wgslModule({ name: 'meu_efeito', source: meuFragmento, requires: [effectsBase] });
}
```

#### Returns

`WgslModule`

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [presentation/resources/PostProcessEffect.ts:95](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/resources/PostProcessEffect.ts#L95)

Effects não declaram GPUDescriptors — params buffer é gerenciado pelo PostFlow.

#### Returns

readonly `GPUDescriptor`[]

#### Implementation of

`Resource.getDescriptors`

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [presentation/resources/PostProcessEffect.ts:99](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/resources/PostProcessEffect.ts#L99)

Effects não declaram PipelineDescriptors — PostFlow cria via `paramsBytes` + shader.

#### Returns

readonly `PipelineDescriptor`[]

#### Implementation of

`Resource.getPipelineDescriptors`

***

### paramsBytes()

> **paramsBytes**(): `Uint8Array`

Defined in: [presentation/resources/PostProcessEffect.ts:82](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/resources/PostProcessEffect.ts#L82)

Serializa `strength + aux` em 16 bytes para upload no uniform buffer
do effect. Override para layouts custom — mas mantenha 16 bytes para
compatibilidade com o pipeline padrão.

#### Returns

`Uint8Array`
