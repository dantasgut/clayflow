[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / XPBDFlow

# Class: XPBDFlow

Defined in: [elements/physics/flows/XPBDFlow.ts:71](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/flows/XPBDFlow.ts#L71)

XPBDFlow — corpos macios por XPBD (partículas + restrições de distância). O quadro executa `time.steps × substeps`
iterações (predict → solve → atualização de velocidade), cada uma com a sua região de `SimParams`
(`dt = time.stepDt / substeps`) ligada por offset dinâmico.

Slots: o pool de corpos do `bodyType` do registro, o `Time`, o pool de restrições (opcional) e o `GravityField`
(opcional, padrão `[0, −9,81, 0]`). Os pipelines de predição e velocidade são declarados; o de restrições é
preparado numa transição quando o pool de restrições existe. Os parâmetros por iteração são escritos em
`framePrepare` — o `dispatch` só grava.

## Extends

- `Flow`\<[`XPBDSlots`](../interfaces/XPBDSlots.md), `"running"`\>

## Constructors

### Constructor

> **new XPBDFlow**(`ctx`, `options?`): `XPBDFlow`

Defined in: [elements/physics/flows/XPBDFlow.ts:85](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/flows/XPBDFlow.ts#L85)

#### Parameters

##### ctx

`FlowContext`

##### options?

[`XPBDFlowOptions`](../interfaces/XPBDFlowOptions.md) = `{}`

#### Returns

`XPBDFlow`

#### Overrides

`Flow<XPBDSlots, 'running'>.constructor`

## Properties

### bindings

> `readonly` **bindings**: `BindingSources`

Defined in: [elements/physics/flows/XPBDFlow.ts:75](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/flows/XPBDFlow.ts#L75)

Bindings privados iniciais por nome de variável WGSL (uniforms por passo, temporários do algoritmo).

#### Overrides

`Flow.bindings`

***

### initialState

> `protected` `readonly` **initialState**: `"running"`

Defined in: [elements/physics/flows/XPBDFlow.ts:76](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/flows/XPBDFlow.ts#L76)

Estado inicial do algoritmo.

#### Overrides

`Flow.initialState`

***

### listens

> `readonly` **listens**: readonly `Schema`[] = `[]`

Defined in: [scene/flows/Flow.ts:69](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/flows/Flow.ts#L69)

Schemas cujos `resourceReady` o Flow recebe como evento.

#### Inherited from

`Flow.listens`

***

### pipelines

> `readonly` **pipelines**: readonly `PipelineDescriptor`[]

Defined in: [elements/physics/flows/XPBDFlow.ts:74](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/flows/XPBDFlow.ts#L74)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Overrides

`Flow.pipelines`

***

### slots

> `readonly` **slots**: [`XPBDSlots`](../interfaces/XPBDSlots.md)

Defined in: [elements/physics/flows/XPBDFlow.ts:73](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/flows/XPBDFlow.ts#L73)

Slots consumidos, por nome.

#### Overrides

`Flow.slots`

***

### transitions

> `protected` `readonly` **transitions**: `FlowTransitions`\<`"running"`, `TransitionContext`\<[`XPBDSlots`](../interfaces/XPBDSlots.md)\>\>

Defined in: [elements/physics/flows/XPBDFlow.ts:77](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/flows/XPBDFlow.ts#L77)

Tabela de transições (estado × evento).

#### Overrides

`Flow.transitions`

***

### type

> `readonly` **type**: `"XPBDFlow"` = `'XPBDFlow'`

Defined in: [elements/physics/flows/XPBDFlow.ts:72](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/flows/XPBDFlow.ts#L72)

Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação).

#### Overrides

`Flow.type`

## Accessors

### lifecycle

#### Get Signature

> **get** **lifecycle**(): `FlowLifecycle`

Defined in: [scene/flows/Flow.ts:79](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/flows/Flow.ts#L79)

Estado do ciclo de vida (só a C2 o muda).

##### Returns

`FlowLifecycle`

#### Inherited from

`Flow.lifecycle`

***

### state

#### Get Signature

> **get** **state**(): `S`

Defined in: [scene/flows/Flow.ts:84](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/flows/Flow.ts#L84)

Estado próprio do algoritmo (só transições o mudam).

##### Returns

`S`

#### Inherited from

`Flow.state`

## Methods

### dispatch()

> **dispatch**(`frame`, `bound`): `void`

Defined in: [elements/physics/flows/XPBDFlow.ts:148](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/flows/XPBDFlow.ts#L148)

Grava as iterações do quadro com a região de parâmetros de cada uma.

#### Parameters

##### frame

`Frame`

##### bound

`BoundFlow`\<[`XPBDSlots`](../interfaces/XPBDSlots.md)\>

#### Returns

`void`

#### Overrides

`Flow.dispatch`

***

### dispose()

> **dispose**(): `void`

Defined in: [elements/physics/flows/XPBDFlow.ts:181](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/flows/XPBDFlow.ts#L181)

Libera os parâmetros por iteração.

#### Returns

`void`

#### Overrides

`Flow.dispose`
