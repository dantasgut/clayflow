[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / FEMFlow

# Class: FEMFlow

Defined in: [elements/physics/flows/FEMFlow.ts:61](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/physics/flows/FEMFlow.ts#L61)

FEMFlow — corpos macios por elementos finitos (predict + atualização de velocidade). O quadro executa
`time.steps × substeps` iterações, cada uma com a sua região de `FEMSimParams` (`dt_sub = stepDt / substeps`,
`dt_frame = stepDt`) ligada por offset dinâmico.

Slots: o pool de nós do `bodyType` do registro, o `Time` e o `GravityField` (opcional). Pipelines declarados com
`consumes`; parâmetros por iteração escritos em `framePrepare` — o `dispatch` só grava.

## Extends

- `Flow`\<[`FEMSlots`](../interfaces/FEMSlots.md), `"running"`\>

## Constructors

### Constructor

> **new FEMFlow**(`ctx`, `options?`): `FEMFlow`

Defined in: [elements/physics/flows/FEMFlow.ts:90](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/physics/flows/FEMFlow.ts#L90)

#### Parameters

##### ctx

`FlowContext`

##### options?

[`FEMFlowOptions`](../interfaces/FEMFlowOptions.md) = `{}`

#### Returns

`FEMFlow`

#### Overrides

`Flow<FEMSlots, 'running'>.constructor`

## Properties

### bindings

> `readonly` **bindings**: `BindingSources`

Defined in: [elements/physics/flows/FEMFlow.ts:65](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/physics/flows/FEMFlow.ts#L65)

Bindings privados iniciais por nome de variável WGSL (uniforms por passo, temporários do algoritmo).

#### Overrides

`Flow.bindings`

***

### initialState

> `protected` `readonly` **initialState**: `"running"`

Defined in: [elements/physics/flows/FEMFlow.ts:66](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/physics/flows/FEMFlow.ts#L66)

Estado inicial do algoritmo.

#### Overrides

`Flow.initialState`

***

### listens

> `readonly` **listens**: readonly `Schema`[] = `[]`

Defined in: [scene/flows/Flow.ts:69](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/flows/Flow.ts#L69)

Schemas cujos `resourceReady` o Flow recebe como evento.

#### Inherited from

`Flow.listens`

***

### pipelines

> `readonly` **pipelines**: readonly `PipelineDescriptor`[]

Defined in: [elements/physics/flows/FEMFlow.ts:64](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/physics/flows/FEMFlow.ts#L64)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Overrides

`Flow.pipelines`

***

### slots

> `readonly` **slots**: [`FEMSlots`](../interfaces/FEMSlots.md)

Defined in: [elements/physics/flows/FEMFlow.ts:63](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/physics/flows/FEMFlow.ts#L63)

Slots consumidos, por nome.

#### Overrides

`Flow.slots`

***

### transitions

> `protected` `readonly` **transitions**: `FlowTransitions`\<`"running"`, `TransitionContext`\<[`FEMSlots`](../interfaces/FEMSlots.md)\>\>

Defined in: [elements/physics/flows/FEMFlow.ts:67](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/physics/flows/FEMFlow.ts#L67)

Tabela de transições (estado × evento).

#### Overrides

`Flow.transitions`

***

### type

> `readonly` **type**: `"FEMFlow"` = `'FEMFlow'`

Defined in: [elements/physics/flows/FEMFlow.ts:62](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/physics/flows/FEMFlow.ts#L62)

Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação).

#### Overrides

`Flow.type`

## Accessors

### lifecycle

#### Get Signature

> **get** **lifecycle**(): `FlowLifecycle`

Defined in: [scene/flows/Flow.ts:79](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/flows/Flow.ts#L79)

Estado do ciclo de vida (só a C2 o muda).

##### Returns

`FlowLifecycle`

#### Inherited from

`Flow.lifecycle`

***

### state

#### Get Signature

> **get** **state**(): `S`

Defined in: [scene/flows/Flow.ts:84](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/flows/Flow.ts#L84)

Estado próprio do algoritmo (só transições o mudam).

##### Returns

`S`

#### Inherited from

`Flow.state`

## Methods

### dispatch()

> **dispatch**(`frame`, `bound`): `void`

Defined in: [elements/physics/flows/FEMFlow.ts:122](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/physics/flows/FEMFlow.ts#L122)

Grava as iterações do quadro com a região de parâmetros de cada uma.

#### Parameters

##### frame

`Frame`

##### bound

`BoundFlow`\<[`FEMSlots`](../interfaces/FEMSlots.md)\>

#### Returns

`void`

#### Overrides

`Flow.dispatch`

***

### dispose()

> **dispose**(): `void`

Defined in: [elements/physics/flows/FEMFlow.ts:142](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/physics/flows/FEMFlow.ts#L142)

Libera os parâmetros por iteração.

#### Returns

`void`

#### Overrides

`Flow.dispose`
