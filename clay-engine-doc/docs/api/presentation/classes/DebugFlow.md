[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / DebugFlow

# Class: DebugFlow

Defined in: [presentation/flows/DebugFlow.ts:45](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/DebugFlow.ts#L45)

DebugFlow — overlay opcional de FPS/frame time + emissão periódica de
`profilerStats`. Não desenha nada por padrão (flow lightweight); um
UIFlow/UiText pode subscrever ao evento e renderizar o texto.

Sem slots nem pipelines: observa `frameTick` (tempo do quadro) e `frameComplete` (tempos de GPU por passe) no
EventBus da cena desde a construção.

## Extends

- `Flow`\<[`DebugSlots`](../type-aliases/DebugSlots.md), `"idle"`\>

## Constructors

### Constructor

> **new DebugFlow**(`ctx`, `options?`): `DebugFlow`

Defined in: [presentation/flows/DebugFlow.ts:70](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/DebugFlow.ts#L70)

#### Parameters

##### ctx

`Pick`\<`FlowContext`, `"events"`\>

##### options?

[`DebugFlowOptions`](../interfaces/DebugFlowOptions.md) = `{}`

#### Returns

`DebugFlow`

#### Overrides

`Flow<DebugSlots, 'idle'>.constructor`

## Properties

### bindings

> `readonly` **bindings**: `BindingSources` = `{}`

Defined in: [scene/flows/Flow.ts:67](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/flows/Flow.ts#L67)

Bindings privados iniciais por nome de variável WGSL (uniforms por passo, temporários do algoritmo).

#### Inherited from

`Flow.bindings`

***

### initialState

> `protected` `readonly` **initialState**: `"idle"`

Defined in: [presentation/flows/DebugFlow.ts:48](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/DebugFlow.ts#L48)

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

> `readonly` **pipelines**: readonly `PipelineDescriptor`[] = `[]`

Defined in: [scene/flows/Flow.ts:65](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/flows/Flow.ts#L65)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Inherited from

`Flow.pipelines`

***

### slots

> `readonly` **slots**: `Readonly`\<`Record`\<`string`, `never`\>\>

Defined in: [presentation/flows/DebugFlow.ts:47](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/DebugFlow.ts#L47)

Slots consumidos, por nome.

#### Overrides

`Flow.slots`

***

### transitions

> `protected` `readonly` **transitions**: `FlowTransitions`\<`"idle"`, `TransitionContext`\<[`DebugSlots`](../type-aliases/DebugSlots.md)\>\>

Defined in: [presentation/flows/DebugFlow.ts:49](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/DebugFlow.ts#L49)

Tabela de transições (estado × evento).

#### Overrides

`Flow.transitions`

***

### type

> `readonly` **type**: `"DebugFlow"` = `'DebugFlow'`

Defined in: [presentation/flows/DebugFlow.ts:46](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/DebugFlow.ts#L46)

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

> **dispatch**(`_frame`): `void`

Defined in: [presentation/flows/DebugFlow.ts:141](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/DebugFlow.ts#L141)

Grava os comandos do quadro. Chamado só quando `lifecycle === 'ready'`.

#### Parameters

##### \_frame

`Frame`

#### Returns

`void`

#### Overrides

`Flow.dispatch`

***

### dispose()

> **dispose**(): `void`

Defined in: [presentation/flows/DebugFlow.ts:98](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/DebugFlow.ts#L98)

Descarte do estágio: remove as inscrições no EventBus e o ouvinte de teclado.

#### Returns

`void`

#### Overrides

`Flow.dispose`

***

### isEnabled()

> **isEnabled**(): `boolean`

Defined in: [presentation/flows/DebugFlow.ts:117](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/DebugFlow.ts#L117)

True se DebugFlow está coletando + emitindo stats.

#### Returns

`boolean`

***

### setEnabled()

> **setEnabled**(`value`): `void`

Defined in: [presentation/flows/DebugFlow.ts:113](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/DebugFlow.ts#L113)

Habilita/desabilita emissão de profilerStats event a cada frame.

#### Parameters

##### value

`boolean`

#### Returns

`void`
