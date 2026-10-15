[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / FEMFlow

# Class: FEMFlow

Defined in: [elements/physics/flows/FEMFlow.ts:72](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/FEMFlow.ts#L72)

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

Defined in: [elements/physics/flows/FEMFlow.ts:130](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/FEMFlow.ts#L130)

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

Defined in: [elements/physics/flows/FEMFlow.ts:76](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/FEMFlow.ts#L76)

Bindings privados iniciais por nome de variável WGSL (uniforms por passo, temporários do algoritmo).

#### Overrides

`Flow.bindings`

***

### initialState

> `protected` `readonly` **initialState**: `"running"`

Defined in: [elements/physics/flows/FEMFlow.ts:77](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/FEMFlow.ts#L77)

Estado inicial do algoritmo.

#### Overrides

`Flow.initialState`

***

### listens

> `readonly` **listens**: readonly `Schema`[] = `[]`

Defined in: [scene/flows/Flow.ts:69](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/flows/Flow.ts#L69)

Schemas cujos `resourceReady` o Flow recebe como evento.

#### Inherited from

`Flow.listens`

***

### pipelines

> `readonly` **pipelines**: readonly `PipelineDescriptor`[]

Defined in: [elements/physics/flows/FEMFlow.ts:75](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/FEMFlow.ts#L75)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Overrides

`Flow.pipelines`

***

### slots

> `readonly` **slots**: [`FEMSlots`](../interfaces/FEMSlots.md)

Defined in: [elements/physics/flows/FEMFlow.ts:74](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/FEMFlow.ts#L74)

Slots consumidos, por nome.

#### Overrides

`Flow.slots`

***

### transitions

> `protected` `readonly` **transitions**: `FlowTransitions`\<`"running"`, `TransitionContext`\<[`FEMSlots`](../interfaces/FEMSlots.md)\>\>

Defined in: [elements/physics/flows/FEMFlow.ts:78](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/FEMFlow.ts#L78)

Tabela de transições (estado × evento).

#### Overrides

`Flow.transitions`

***

### type

> `readonly` **type**: `"FEMFlow"` = `'FEMFlow'`

Defined in: [elements/physics/flows/FEMFlow.ts:73](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/FEMFlow.ts#L73)

Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação).

#### Overrides

`Flow.type`

## Accessors

### lifecycle

#### Get Signature

> **get** **lifecycle**(): `FlowLifecycle`

Defined in: [scene/flows/Flow.ts:79](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/flows/Flow.ts#L79)

Estado do ciclo de vida (só a C2 o muda).

##### Returns

`FlowLifecycle`

#### Inherited from

`Flow.lifecycle`

***

### state

#### Get Signature

> **get** **state**(): `S`

Defined in: [scene/flows/Flow.ts:84](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/flows/Flow.ts#L84)

Estado próprio do algoritmo (só transições o mudam).

##### Returns

`S`

#### Inherited from

`Flow.state`

## Methods

### dispatch()

> **dispatch**(`frame`, `bound`): `void`

Defined in: [elements/physics/flows/FEMFlow.ts:172](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/FEMFlow.ts#L172)

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

Defined in: [elements/physics/flows/FEMFlow.ts:201](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/FEMFlow.ts#L201)

Libera os parâmetros por iteração e o conjunto de colliders.

#### Returns

`void`

#### Overrides

`Flow.dispose`
