[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / ProbeFlow

# Class: ProbeFlow

Defined in: [src/elements/lighting/ProbeFlow.ts:238](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/ProbeFlow.ts#L238)

ProbeFlow — as sondas da iluminação global (spec 033, R2/R5/R6). A cada quadro: as cascatas centradas na câmera
(endereçamento circular), a fração das sondas atualizada (em rodízio) e a rotação dos raios; grava num passe os raios
das sondas pela estrutura de raios (acertos sombreados com o material da entidade, a luz direta com raio de sombra e
o rebatimento anterior; os que escapam leem o ambiente), o acúmulo nos mapas (irradiância de cada rebatimento,
radiância especular, visibilidade) com histerese, o estado das sondas (dentro da geometria, relocação) e a cópia para
os atlas filtrados que o desenho lê. Os materiais por função da cena são compostos no kernel dos raios; uma mudança
no conjunto prepara um kernel novo, que entra quando compila. Fase `shadow` (depois da estrutura de raios e do céu).

## Extends

- [`Flow`](../../platform/web/classes/Flow.md)\<[`ProbeSlots`](../interfaces/ProbeSlots.md), `"idle"`\>

## Constructors

### Constructor

> **new ProbeFlow**(`ctx`): `ProbeFlow`

Defined in: [src/elements/lighting/ProbeFlow.ts:264](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/ProbeFlow.ts#L264)

#### Parameters

##### ctx

[`FlowContext`](../../platform/web/interfaces/FlowContext.md)

#### Returns

`ProbeFlow`

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`constructor`](../../platform/web/classes/Flow.md#constructor)

## Properties

### bindings

> `readonly` **bindings**: `ReadonlyMap`\<[`WgslResource`](../../platform/web/interfaces/WgslResource.md), [`BindingSource`](../../platform/web/type-aliases/BindingSource.md)\>

Defined in: [src/elements/lighting/ProbeFlow.ts:241](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/ProbeFlow.ts#L241)

Bindings privados iniciais por recurso declarado (uniforms por passo, temporários do algoritmo).

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`bindings`](../../platform/web/classes/Flow.md#bindings)

***

### initialState

> `protected` `readonly` **initialState**: `"idle"`

Defined in: [src/elements/lighting/ProbeFlow.ts:242](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/ProbeFlow.ts#L242)

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

> `readonly` **slots**: [`ProbeSlots`](../interfaces/ProbeSlots.md)

Defined in: [src/elements/lighting/ProbeFlow.ts:240](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/ProbeFlow.ts#L240)

Slots consumidos, por nome.

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`slots`](../../platform/web/classes/Flow.md#slots)

***

### transitions

> `protected` `readonly` **transitions**: [`FlowTransitions`](../../platform/web/type-aliases/FlowTransitions.md)\<`"idle"`, `Ctx`\>

Defined in: [src/elements/lighting/ProbeFlow.ts:243](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/ProbeFlow.ts#L243)

Tabela de transições (estado × evento).

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`transitions`](../../platform/web/classes/Flow.md#transitions)

***

### type

> `readonly` **type**: `"ProbeFlow"` = `'ProbeFlow'`

Defined in: [src/elements/lighting/ProbeFlow.ts:239](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/ProbeFlow.ts#L239)

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

Defined in: [src/elements/lighting/ProbeFlow.ts:313](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/lighting/ProbeFlow.ts#L313)

Raios, acúmulo, estado e atlas das sondas atualizadas e, com a coleta final na tela, a colocação, os raios e o
acúmulo das sondas de tela, num passe.

#### Parameters

##### frame

[`Frame`](../../platform/web/interfaces/Frame.md)

##### bound

[`BoundFlow`](../../platform/web/interfaces/BoundFlow.md)\<[`ProbeSlots`](../interfaces/ProbeSlots.md)\>

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
