[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / TransformFlow

# Class: TransformFlow

Defined in: [src/elements/scene/flows/TransformFlow.ts:115](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/TransformFlow.ts#L115)

Estágio de transformação — produz, na GPU, a matriz de mundo e a matriz de normais de cada `Transform` a partir da
sua intenção (posição, rotação, escala), com a convenção `M = T · R · S`. O resultado fica no pool
`WorldTransform` (mesmo slot do `Transform`), que os estágios de sombra e desenho leem por índice de instância.

Slots: os pools `Transform` e `WorldTransform` (fornecedores `{ pool }` dos recursos) e as entidades com `Transform`. Reativo
pela tabela de transições: fica `stale` com `poolWritten` do pool `Transform`, entidades inseridas ou removidas,
pool realocado ou bind group substituído; em `stale`, `framePrepare` escreve a contagem (uma vez por quadro) e o
quadro grava a composição; `frameRecorded` volta a `clean` — numa cena parada não faz nada. Se o pool tem slots de
posse da GPU (a física publica a pose direto no `Transform`, spec 007), a composição roda todo quadro.

Hierarquia opcional (`Parent`, spec 007, research R12): a lista de elos (filho, pai) ordenada por nível é mantida
por eventos — refeita só quando o conjunto de filhos, os pais ou a posse da GPU mudam — e enviada numa escrita. O
quadro compõe todos os slots (nível 0) e depois cada nível ≥ 1 sobre o seu trecho da lista, com
`world = world[pai] · T · R · S`; cada nível lê o anterior já composto (passes em ordem). Sem nenhum `Parent`, um
único despacho, como antes. Ciclo, pai sem `Transform` e `Parent` em `Transform` de posse da GPU são erro; pai
removido torna o filho raiz com aviso.

Substituível: é o estágio padrão da fase `transform`. Registrar outro Flow nessa fase permite outras regras de
transformação — a base para a hierarquia opcional, para a função `transform` do usuário e para cadeias não
euclidianas do roadmap.

## Extends

- [`Flow`](../../platform/web/classes/Flow.md)\<[`TransformSlots`](../interfaces/TransformSlots.md), [`TransformState`](../type-aliases/TransformState.md)\>

## Constructors

### Constructor

> **new TransformFlow**(`ctx`): `TransformFlow`

Defined in: [src/elements/scene/flows/TransformFlow.ts:179](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/TransformFlow.ts#L179)

#### Parameters

##### ctx

[`FlowContext`](../../platform/web/interfaces/FlowContext.md)

#### Returns

`TransformFlow`

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`constructor`](../../platform/web/classes/Flow.md#constructor)

## Properties

### bindings

> `readonly` **bindings**: [`BindingSources`](../../platform/web/type-aliases/BindingSources.md)

Defined in: [src/scene/flows/Flow.ts:79](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L79)

Bindings privados iniciais por recurso declarado (uniforms por passo, temporários do algoritmo).

#### Inherited from

[`Flow`](../../platform/web/classes/Flow.md).[`bindings`](../../platform/web/classes/Flow.md#bindings)

***

### initialState

> `protected` `readonly` **initialState**: `"stale"`

Defined in: [src/elements/scene/flows/TransformFlow.ts:140](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/TransformFlow.ts#L140)

Estado inicial do algoritmo.

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`initialState`](../../platform/web/classes/Flow.md#initialstate)

***

### listens

> `readonly` **listens**: ([`StructSchema`](../../platform/web/classes/StructSchema.md) \| [`WgslPoint`](../../platform/web/interfaces/WgslPoint.md))[]

Defined in: [src/elements/scene/flows/TransformFlow.ts:119](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/TransformFlow.ts#L119)

O pool `Transform` e os registros de todas as formas das funções `transform` (spec 031, R8).

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`listens`](../../platform/web/classes/Flow.md#listens)

***

### pipelines

> `readonly` **pipelines**: readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

Defined in: [src/elements/scene/flows/TransformFlow.ts:120](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/TransformFlow.ts#L120)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`pipelines`](../../platform/web/classes/Flow.md#pipelines)

***

### slots

> `readonly` **slots**: [`TransformSlots`](../interfaces/TransformSlots.md)

Defined in: [src/elements/scene/flows/TransformFlow.ts:117](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/TransformFlow.ts#L117)

Slots consumidos, por nome.

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`slots`](../../platform/web/classes/Flow.md#slots)

***

### transitions

> `protected` `readonly` **transitions**: [`FlowTransitions`](../../platform/web/type-aliases/FlowTransitions.md)\<[`TransformState`](../type-aliases/TransformState.md), [`TransitionContext`](../../platform/web/interfaces/TransitionContext.md)\<[`TransformSlots`](../interfaces/TransformSlots.md)\>\>

Defined in: [src/elements/scene/flows/TransformFlow.ts:141](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/TransformFlow.ts#L141)

Tabela de transições (estado × evento).

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`transitions`](../../platform/web/classes/Flow.md#transitions)

***

### type

> `readonly` **type**: `"TransformFlow"` = `'TransformFlow'`

Defined in: [src/elements/scene/flows/TransformFlow.ts:116](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/TransformFlow.ts#L116)

Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação).

#### Overrides

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`type`](../../platform/web/classes/RenderFlow.md#type)

## Accessors

### lifecycle

#### Get Signature

> **get** **lifecycle**(): [`FlowLifecycle`](../../platform/web/type-aliases/FlowLifecycle.md)

Defined in: [src/scene/flows/Flow.ts:94](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L94)

Estado do ciclo de vida (só a C2 o muda).

##### Returns

[`FlowLifecycle`](../../platform/web/type-aliases/FlowLifecycle.md)

#### Inherited from

[`Flow`](../../platform/web/classes/Flow.md).[`lifecycle`](../../platform/web/classes/Flow.md#lifecycle)

***

### state

#### Get Signature

> **get** **state**(): `S`

Defined in: [src/scene/flows/Flow.ts:99](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L99)

Estado próprio do algoritmo (só transições o mudam).

##### Returns

`S`

#### Inherited from

[`Flow`](../../platform/web/classes/Flow.md).[`state`](../../platform/web/classes/Flow.md#state)

## Methods

### dispatch()

> **dispatch**(`frame`, `bound`): `void`

Defined in: [src/elements/scene/flows/TransformFlow.ts:316](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/TransformFlow.ts#L316)

Grava a composição quando há intenção pendente (`stale`).

#### Parameters

##### frame

[`Frame`](../../platform/web/interfaces/Frame.md)

##### bound

[`BoundFlow`](../../platform/web/interfaces/BoundFlow.md)\<[`TransformSlots`](../interfaces/TransformSlots.md)\>

#### Returns

`void`

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`dispatch`](../../platform/web/classes/Flow.md#dispatch)

***

### dispose()

> **dispose**(): `void`

Defined in: [src/scene/flows/Flow.ts:107](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L107)

Libera os recursos privados do Flow. Chamado pela C2 no descarte (`unregister`).

#### Returns

`void`

#### Inherited from

[`Flow`](../../platform/web/classes/Flow.md).[`dispose`](../../platform/web/classes/Flow.md#dispose)
