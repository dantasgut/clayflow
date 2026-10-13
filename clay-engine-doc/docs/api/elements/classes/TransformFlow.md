[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / TransformFlow

# Class: TransformFlow

Defined in: [elements/scene/flows/TransformFlow.ts:49](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/scene/flows/TransformFlow.ts#L49)

Estágio de transformação — produz, na GPU, a matriz de mundo e a matriz de normais de cada `Transform` a partir da
sua intenção (posição, rotação, escala), com a convenção `M = T · R · S`. O resultado fica no pool
`WorldTransform` (mesmo slot do `Transform`), que os estágios de sombra e desenho leem por índice de instância.

Slots: os pools `Transform` e `WorldTransform` (ligados por `consumes`) e as entidades com `Transform`. Reativo
pela tabela de transições: fica `stale` com `resourceReady` de um `Transform`, entidades inseridas ou removidas,
pool realocado ou bind group substituído; em `stale`, `framePrepare` escreve a contagem (uma vez por quadro) e o
quadro grava a composição; `frameRecorded` volta a `clean` — numa cena parada não faz nada.

Substituível: é o estágio padrão da fase `transform`. Registrar outro Flow nessa fase permite outras regras de
transformação — a base para a hierarquia opcional, para a função `transform` do usuário e para cadeias não
euclidianas do roadmap.

## Extends

- `Flow`\<[`TransformSlots`](../interfaces/TransformSlots.md), [`TransformState`](../type-aliases/TransformState.md)\>

## Constructors

### Constructor

> **new TransformFlow**(`ctx`): `TransformFlow`

Defined in: [elements/scene/flows/TransformFlow.ts:77](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/scene/flows/TransformFlow.ts#L77)

#### Parameters

##### ctx

`FlowContext`

#### Returns

`TransformFlow`

#### Overrides

`Flow<TransformSlots, TransformState>.constructor`

## Properties

### bindings

> `readonly` **bindings**: `object`

Defined in: [elements/scene/flows/TransformFlow.ts:62](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/scene/flows/TransformFlow.ts#L62)

Bindings privados iniciais por nome de variável WGSL (uniforms por passo, temporários do algoritmo).

#### params

> `readonly` **params**: `UniformBufferSpec`

Parâmetros da composição (`TransformParams`: contagem).

#### Overrides

`Flow.bindings`

***

### initialState

> `protected` `readonly` **initialState**: `"stale"`

Defined in: [elements/scene/flows/TransformFlow.ts:66](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/scene/flows/TransformFlow.ts#L66)

Estado inicial do algoritmo.

#### Overrides

`Flow.initialState`

***

### listens

> `readonly` **listens**: `StructSchema`[]

Defined in: [elements/scene/flows/TransformFlow.ts:52](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/scene/flows/TransformFlow.ts#L52)

Schemas cujos `resourceReady` o Flow recebe como evento.

#### Overrides

`Flow.listens`

***

### pipelines

> `readonly` **pipelines**: readonly `PipelineDescriptor`[]

Defined in: [elements/scene/flows/TransformFlow.ts:53](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/scene/flows/TransformFlow.ts#L53)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Overrides

`Flow.pipelines`

***

### slots

> `readonly` **slots**: [`TransformSlots`](../interfaces/TransformSlots.md)

Defined in: [elements/scene/flows/TransformFlow.ts:51](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/scene/flows/TransformFlow.ts#L51)

Slots consumidos, por nome.

#### Overrides

`Flow.slots`

***

### transitions

> `protected` `readonly` **transitions**: `FlowTransitions`\<[`TransformState`](../type-aliases/TransformState.md), `TransitionContext`\<[`TransformSlots`](../interfaces/TransformSlots.md)\>\>

Defined in: [elements/scene/flows/TransformFlow.ts:67](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/scene/flows/TransformFlow.ts#L67)

Tabela de transições (estado × evento).

#### Overrides

`Flow.transitions`

***

### type

> `readonly` **type**: `"TransformFlow"` = `'TransformFlow'`

Defined in: [elements/scene/flows/TransformFlow.ts:50](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/scene/flows/TransformFlow.ts#L50)

Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação).

#### Overrides

`Flow.type`

## Accessors

### lifecycle

#### Get Signature

> **get** **lifecycle**(): `FlowLifecycle`

Defined in: [scene/flows/Flow.ts:79](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/scene/flows/Flow.ts#L79)

Estado do ciclo de vida (só a C2 o muda).

##### Returns

`FlowLifecycle`

#### Inherited from

`Flow.lifecycle`

***

### state

#### Get Signature

> **get** **state**(): `S`

Defined in: [scene/flows/Flow.ts:84](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/scene/flows/Flow.ts#L84)

Estado próprio do algoritmo (só transições o mudam).

##### Returns

`S`

#### Inherited from

`Flow.state`

## Methods

### dispatch()

> **dispatch**(`frame`, `bound`): `void`

Defined in: [elements/scene/flows/TransformFlow.ts:112](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/scene/flows/TransformFlow.ts#L112)

Grava a composição quando há intenção pendente (`stale`).

#### Parameters

##### frame

`Frame`

##### bound

`BoundFlow`\<[`TransformSlots`](../interfaces/TransformSlots.md)\>

#### Returns

`void`

#### Overrides

`Flow.dispatch`

***

### dispose()

> **dispose**(): `void`

Defined in: [elements/scene/flows/TransformFlow.ts:124](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/scene/flows/TransformFlow.ts#L124)

Libera o uniform de parâmetros.

#### Returns

`void`

#### Overrides

`Flow.dispose`
