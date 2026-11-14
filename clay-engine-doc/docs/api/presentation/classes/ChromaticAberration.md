[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / ChromaticAberration

# Class: ChromaticAberration

Defined in: [src/presentation/flows/effects/ChromaticAberration.ts:3](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/effects/ChromaticAberration.ts#L3)

PostProcessEffect é a base de todos os post-process passes do PostFlow.
Cada effect contribui com 1 fragment entry point + 16 bytes de uniform
(strength + aux). PostFlow encadeia os effects ativos via ping-pong de
texturas: scene → pp[0] → pp[1] → ... → canvas.

Built-in effects: Bloom, Blur, ChromaticAberration, ColorGrading,
Vignette (a apresentação, `ToneMapping`, não é efeito: é o último passe). Custom effects: implemente `fragmentModule()`
retornando um módulo WGSL próprio (ver método).

Subclasses devem implementar `name` (identificador) e `fragmentEntry`
(nome do fragment fn no WGSL).

## Extends

- [`PostProcessEffect`](PostProcessEffect.md)

## Constructors

### Constructor

> **new ChromaticAberration**(`options?`): `ChromaticAberration`

Defined in: [src/presentation/resources/PostProcessEffect.ts:55](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/resources/PostProcessEffect.ts#L55)

#### Parameters

##### options?

[`PostProcessOptions`](../interfaces/PostProcessOptions.md) = `{}`

#### Returns

`ChromaticAberration`

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`constructor`](PostProcessEffect.md#constructor)

## Properties

### state

> **state**: [`ResourceState`](../../platform/web/enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [src/presentation/resources/PostProcessEffect.ts:53](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/resources/PostProcessEffect.ts#L53)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`state`](PostProcessEffect.md#state)

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](../../elements/classes/Entity.md)\<`object`\>[]

Defined in: [src/scene/contracts/Entity.ts:160](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L160)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](../../elements/classes/Entity.md)\<`object`\>[]

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`attached`](PostProcessEffect.md#attached)

***

### data

#### Get Signature

> **get** **data**(): `TData`

Defined in: [src/scene/contracts/Entity.ts:97](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L97)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`TData`

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [src/scene/contracts/Entity.ts:103](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L103)

Troca o dado inteiro; na cena, o recurso inteiro é marcado para envio.

##### Parameters

###### next

`TData`

##### Returns

`void`

Dados runtime do resource (e.g. Camera position, Material albedo,
RigidBody mass). Schema é declarado em `getDescriptors()[i].schema`.
Mutações devem disparar evento `resourceDirty` para re-upload. O tipo
concreto vem do parâmetro de `Entity<TData>`; o motor lê os campos pelo
schema.

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`data`](PostProcessEffect.md#data)

***

### fragmentEntry

#### Get Signature

> **get** **fragmentEntry**(): `string`

Defined in: [src/presentation/flows/effects/ChromaticAberration.ts:7](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/effects/ChromaticAberration.ts#L7)

Nome do fragment entry point no WGSL (e.g. 'fs_bloom').

##### Returns

`string`

#### Overrides

[`PostProcessEffect`](PostProcessEffect.md).[`fragmentEntry`](PostProcessEffect.md#fragmententry)

***

### isEnabled

#### Get Signature

> **get** **isEnabled**(): `boolean`

Defined in: [src/presentation/resources/PostProcessEffect.ts:82](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/resources/PostProcessEffect.ts#L82)

True se o effect deve participar do chain neste frame. Lê `data.enabled`.

##### Returns

`boolean`

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`isEnabled`](PostProcessEffect.md#isenabled)

***

### name

#### Get Signature

> **get** **name**(): `string`

Defined in: [src/presentation/flows/effects/ChromaticAberration.ts:4](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/effects/ChromaticAberration.ts#L4)

Nome único do effect (e.g. 'bloom', 'fxaa'). Usado em discriminator de pipeline/buffer.

##### Returns

`string`

#### Overrides

[`PostProcessEffect`](PostProcessEffect.md).[`name`](PostProcessEffect.md#name)

***

### rawData

#### Get Signature

> **get** `protected` **rawData**(): `Readonly`\<`TData`\>

Defined in: [src/scene/contracts/Entity.ts:117](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L117)

O dado cru, sem o proxy reativo — para leituras do próprio Resource (ex.: uma propriedade derivada consultada pelos
estágios) que não devem criar proxies aninhados. Escrever por aqui não marca o recurso.

##### Returns

`Readonly`\<`TData`\>

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`rawData`](PostProcessEffect.md#rawdata)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [src/scene/contracts/Entity.ts:140](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L140)

Anexa uma Entity-filha. Retorna `this` para chaining fluente.
Não valida ciclos nem múltiplos pais — responsabilidade do caller.

#### Parameters

##### e

[`Entity`](../../elements/classes/Entity.md)\<`object`\>

#### Returns

`this`

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`add`](PostProcessEffect.md#add)

***

### detach()

> **detach**(`e`): `boolean`

Defined in: [src/scene/contracts/Entity.ts:149](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L149)

Desanexa uma Entity-filha direta (inverso de `add`). Devolve `false` se ela não é filha desta. Numa entidade já
inserida, use `World.detach` (que também atualiza a cena).

#### Parameters

##### e

[`Entity`](../../elements/classes/Entity.md)\<`object`\>

#### Returns

`boolean`

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`detach`](PostProcessEffect.md#detach)

***

### fragmentModule()?

> `optional` **fragmentModule**(): [`WgslModule`](../../platform/web/interfaces/WgslModule.md)

Defined in: [src/presentation/resources/PostProcessEffect.ts:79](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/resources/PostProcessEffect.ts#L79)

Override opcional: módulo WGSL próprio contendo o fragment entry point (`fragmentEntry`). Quando definido, o
PostFlow monta um shader dedicado para este effect em vez de usar o comum. O módulo declara
`requires: [effectsBase]` para reutilizar os recursos (`src_tex`, `src_smp`, `params`) e o `vs_fullscreen`:
```ts
fragmentModule() {
    return wgslModule({ name: 'meu_efeito', source: meuFragmento, requires: [effectsBase] });
}
```

#### Returns

[`WgslModule`](../../platform/web/interfaces/WgslModule.md)

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`fragmentModule`](PostProcessEffect.md#fragmentmodule)

***

### getDescriptors()

> **getDescriptors**(): readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

Defined in: [src/presentation/resources/PostProcessEffect.ts:99](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/resources/PostProcessEffect.ts#L99)

Effects não declaram GPUDescriptors — params buffer é gerenciado pelo PostFlow.

#### Returns

readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`getDescriptors`](PostProcessEffect.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

Defined in: [src/presentation/resources/PostProcessEffect.ts:103](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/resources/PostProcessEffect.ts#L103)

Effects não declaram PipelineDescriptors — PostFlow cria via `paramsBytes` + shader.

#### Returns

readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`getPipelineDescriptors`](PostProcessEffect.md#getpipelinedescriptors)

***

### paramsBytes()

> **paramsBytes**(): `Uint8Array`

Defined in: [src/presentation/resources/PostProcessEffect.ts:91](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/resources/PostProcessEffect.ts#L91)

Serializa `strength + aux` em 16 bytes para upload no uniform buffer
do effect. Override para layouts custom — mas mantenha 16 bytes para
compatibilidade com o pipeline padrão.

#### Returns

`Uint8Array`

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`paramsBytes`](PostProcessEffect.md#paramsbytes)

***

### redescribe()

> `protected` **redescribe**(`previous`, `next`): `void`

Defined in: [src/scene/contracts/Entity.ts:127](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L127)

Troca o dado e os descritores em pool de uma vez — o Resource cujo layout depende do próprio dado (ex.: o registro
tipado de uma função de ponto quando a forma dos parâmetros muda; spec 031, R8). `getDescriptors()` já devolve os
novos; `previous` são os de antes. Fora da cena, só troca o dado; na cena, a C2 libera os slots nos pools antigos,
ocupa os dos novos com `next` e recompõe a entidade (`entitiesRecomposed`: registros e conjuntos dos estágios).

#### Parameters

##### previous

readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

##### next

[`PostProcessData`](../interfaces/PostProcessData.md)

#### Returns

`void`

#### Inherited from

[`PostProcessEffect`](PostProcessEffect.md).[`redescribe`](PostProcessEffect.md#redescribe)
