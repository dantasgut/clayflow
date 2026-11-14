[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / DebugFlow

# Class: DebugFlow

Defined in: [src/presentation/flows/DebugFlow.ts:48](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/DebugFlow.ts#L48)

DebugFlow — overlay opcional de FPS/frame time + emissão periódica de
`profilerStats`. Não desenha nada por padrão (flow lightweight); um
UIFlow/UiText pode subscrever ao evento e renderizar o texto.

Sem slots nem pipelines: observa `frameTick` (tempo do quadro) e `frameComplete` (tempos de GPU por passe) no
EventBus da cena desde a construção.

## Extends

- [`Flow`](../../platform/web/classes/Flow.md)\<[`DebugSlots`](../type-aliases/DebugSlots.md), `"idle"`\>

## Constructors

### Constructor

> **new DebugFlow**(`ctx`, `options?`): `DebugFlow`

Defined in: [src/presentation/flows/DebugFlow.ts:73](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/DebugFlow.ts#L73)

#### Parameters

##### ctx

`Pick`\<[`FlowContext`](../../platform/web/interfaces/FlowContext.md), `"events"`\>

##### options?

[`DebugFlowOptions`](../interfaces/DebugFlowOptions.md) = `{}`

#### Returns

`DebugFlow`

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

> `protected` `readonly` **initialState**: `"idle"`

Defined in: [src/presentation/flows/DebugFlow.ts:51](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/DebugFlow.ts#L51)

Estado inicial do algoritmo.

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`initialState`](../../platform/web/classes/Flow.md#initialstate)

***

### listens

> `readonly` **listens**: readonly [`Listened`](../../platform/web/type-aliases/Listened.md)[] = `[]`

Defined in: [src/scene/flows/Flow.ts:84](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L84)

Schemas (ou famílias de schemas: os registros de um ponto de extensão) cujos `resourceReady` e `poolWritten` o
Flow recebe como evento.

#### Inherited from

[`Flow`](../../platform/web/classes/Flow.md).[`listens`](../../platform/web/classes/Flow.md#listens)

***

### pipelines

> `readonly` **pipelines**: readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[] = `[]`

Defined in: [src/scene/flows/Flow.ts:77](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L77)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Inherited from

[`Flow`](../../platform/web/classes/Flow.md).[`pipelines`](../../platform/web/classes/Flow.md#pipelines)

***

### slots

> `readonly` **slots**: `Readonly`\<`Record`\<`string`, `never`\>\>

Defined in: [src/presentation/flows/DebugFlow.ts:50](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/DebugFlow.ts#L50)

Slots consumidos, por nome.

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`slots`](../../platform/web/classes/Flow.md#slots)

***

### transitions

> `protected` `readonly` **transitions**: [`FlowTransitions`](../../platform/web/type-aliases/FlowTransitions.md)\<`"idle"`, [`TransitionContext`](../../platform/web/interfaces/TransitionContext.md)\<[`DebugSlots`](../type-aliases/DebugSlots.md)\>\>

Defined in: [src/presentation/flows/DebugFlow.ts:52](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/DebugFlow.ts#L52)

Tabela de transições (estado × evento).

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`transitions`](../../platform/web/classes/Flow.md#transitions)

***

### type

> `readonly` **type**: `"DebugFlow"` = `'DebugFlow'`

Defined in: [src/presentation/flows/DebugFlow.ts:49](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/DebugFlow.ts#L49)

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

> **dispatch**(`_frame`): `void`

Defined in: [src/presentation/flows/DebugFlow.ts:152](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/DebugFlow.ts#L152)

Grava os comandos do quadro. Chamado só quando `lifecycle === 'ready'`.

#### Parameters

##### \_frame

[`Frame`](../../platform/web/interfaces/Frame.md)

#### Returns

`void`

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`dispatch`](../../platform/web/classes/Flow.md#dispatch)

***

### dispose()

> **dispose**(): `void`

Defined in: [src/presentation/flows/DebugFlow.ts:102](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/DebugFlow.ts#L102)

Descarte do estágio: remove as inscrições no EventBus.

#### Returns

`void`

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`dispose`](../../platform/web/classes/Flow.md#dispose)

***

### isEnabled()

> **isEnabled**(): `boolean`

Defined in: [src/presentation/flows/DebugFlow.ts:117](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/DebugFlow.ts#L117)

True se DebugFlow está coletando + emitindo stats.

#### Returns

`boolean`

***

### setEnabled()

> **setEnabled**(`value`): `void`

Defined in: [src/presentation/flows/DebugFlow.ts:113](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/DebugFlow.ts#L113)

Habilita/desabilita emissão de profilerStats event a cada frame.

#### Parameters

##### value

`boolean`

#### Returns

`void`
