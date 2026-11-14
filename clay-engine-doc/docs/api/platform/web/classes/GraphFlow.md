[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / GraphFlow

# Class: GraphFlow

Defined in: [src/scene/graph/GraphFlow.ts:88](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/GraphFlow.ts#L88)

Grafo de nós de conjunto compilado num Flow (spec 031, R10, FR-017–FR-020): para cada entidade com `SetGraph`, o
plano (`compileSetGraph`), os conjuntos intermediários e os registros `SetCount` (descritores do Resource de trabalho,
alocados pela C2 — spec 039), as
contagens conhecidas na CPU já com os argumentos de despacho e de desenho, os uniforms dos grafos de ponto fundidos e
a instância de cada nó. `dispatch` grava os nós em ordem topológica **só quando o grafo está desatualizado** — ao
entrar, com valores novos (`poolWritten` do registro do `SetGraph`), com topologia nova (revisão) ou, com nó
dependente do tempo, a cada quadro; `frameRecorded` o deixa limpo (FR-020: nada refeito com a cena parada). Nada é
lido de volta: contagens decididas na GPU seguem por despacho e desenho indiretos (FR-019).

## Extends

- [`Flow`](Flow.md)\<[`GraphFlowSlots`](../interfaces/GraphFlowSlots.md), `State`\>

## Constructors

### Constructor

> **new GraphFlow**(`ctx`, `options?`): `GraphFlow`

Defined in: [src/scene/graph/GraphFlow.ts:101](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/GraphFlow.ts#L101)

#### Parameters

##### ctx

[`FlowContext`](../interfaces/FlowContext.md)

##### options?

[`GraphFlowOptions`](../interfaces/GraphFlowOptions.md) = `{}`

#### Returns

`GraphFlow`

#### Overrides

[`Flow`](Flow.md).[`constructor`](Flow.md#constructor)

## Properties

### bindings

> `readonly` **bindings**: [`BindingSources`](../type-aliases/BindingSources.md)

Defined in: [src/scene/flows/Flow.ts:79](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L79)

Bindings privados iniciais por recurso declarado (uniforms por passo, temporários do algoritmo).

#### Inherited from

[`Flow`](Flow.md).[`bindings`](Flow.md#bindings)

***

### initialState

> `protected` `readonly` **initialState**: `"idle"`

Defined in: [src/scene/graph/GraphFlow.ts:92](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/GraphFlow.ts#L92)

Estado inicial do algoritmo.

#### Overrides

[`Flow`](Flow.md).[`initialState`](Flow.md#initialstate)

***

### listens

> `readonly` **listens**: [`StructSchema`](StructSchema.md)[]

Defined in: [src/scene/graph/GraphFlow.ts:91](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/GraphFlow.ts#L91)

Schemas (ou famílias de schemas: os registros de um ponto de extensão) cujos `resourceReady` e `poolWritten` o
Flow recebe como evento.

#### Overrides

[`Flow`](Flow.md).[`listens`](Flow.md#listens)

***

### pipelines

> `readonly` **pipelines**: readonly [`PipelineDescriptor`](../interfaces/PipelineDescriptor.md)[] = `[]`

Defined in: [src/scene/flows/Flow.ts:77](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L77)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Inherited from

[`Flow`](Flow.md).[`pipelines`](Flow.md#pipelines)

***

### slots

> `readonly` **slots**: [`GraphFlowSlots`](../interfaces/GraphFlowSlots.md)

Defined in: [src/scene/graph/GraphFlow.ts:90](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/GraphFlow.ts#L90)

Slots consumidos, por nome.

#### Overrides

[`Flow`](Flow.md).[`slots`](Flow.md#slots)

***

### transitions

> `protected` `readonly` **transitions**: [`FlowTransitions`](../type-aliases/FlowTransitions.md)\<`State`, `Ctx`\>

Defined in: [src/scene/graph/GraphFlow.ts:93](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/GraphFlow.ts#L93)

Tabela de transições (estado × evento).

#### Overrides

[`Flow`](Flow.md).[`transitions`](Flow.md#transitions)

***

### type

> `readonly` **type**: `"GraphFlow"` = `'GraphFlow'`

Defined in: [src/scene/graph/GraphFlow.ts:89](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/GraphFlow.ts#L89)

Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação).

#### Overrides

[`Flow`](Flow.md).[`type`](Flow.md#type)

## Accessors

### lifecycle

#### Get Signature

> **get** **lifecycle**(): [`FlowLifecycle`](../type-aliases/FlowLifecycle.md)

Defined in: [src/scene/flows/Flow.ts:94](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L94)

Estado do ciclo de vida (só a C2 o muda).

##### Returns

[`FlowLifecycle`](../type-aliases/FlowLifecycle.md)

#### Inherited from

[`Flow`](Flow.md).[`lifecycle`](Flow.md#lifecycle)

***

### state

#### Get Signature

> **get** **state**(): `S`

Defined in: [src/scene/flows/Flow.ts:99](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L99)

Estado próprio do algoritmo (só transições o mudam).

##### Returns

`S`

#### Inherited from

[`Flow`](Flow.md).[`state`](Flow.md#state)

## Methods

### dispatch()

> **dispatch**(`frame`, `_bound`): `void`

Defined in: [src/scene/graph/GraphFlow.ts:182](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/GraphFlow.ts#L182)

Grafos desatualizados: grava os nós em ordem topológica.

#### Parameters

##### frame

[`Frame`](../interfaces/Frame.md)

##### \_bound

[`BoundFlow`](../interfaces/BoundFlow.md)\<[`GraphFlowSlots`](../interfaces/GraphFlowSlots.md)\>

#### Returns

`void`

#### Overrides

[`Flow`](Flow.md).[`dispatch`](Flow.md#dispatch)

***

### dispose()

> **dispose**(): `void`

Defined in: [src/scene/graph/GraphFlow.ts:195](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/GraphFlow.ts#L195)

Libera os recursos privados do Flow. Chamado pela C2 no descarte (`unregister`).

#### Returns

`void`

#### Overrides

[`Flow`](Flow.md).[`dispose`](Flow.md#dispose)

***

### isStale()

> **isStale**(`id`): `boolean` \| `undefined`

Defined in: [src/scene/graph/GraphFlow.ts:191](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/GraphFlow.ts#L191)

Grafo da entidade `id` está desatualizado (para testes e depuração).

#### Parameters

##### id

[`EntityId`](../type-aliases/EntityId.md)

#### Returns

`boolean` \| `undefined`
