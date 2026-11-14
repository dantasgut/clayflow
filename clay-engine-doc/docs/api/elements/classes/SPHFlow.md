[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / SPHFlow

# Class: SPHFlow

Defined in: [src/elements/physics/flows/SPHFlow.ts:100](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SPHFlow.ts#L100)

SPHFlow — fluidos por Smoothed Particle Hydrodynamics fracamente compressível (Tait). O quadro executa
`time.steps × substeps` iterações, com `substeps` pelo passo estável do `ParticlePhysics` (CFL 0,4 h/c); cada
uma reconstrói a vizinhança (raio = suporte 2h) e roda densidade → pressão → forças → integração → colisão com a
sua região de `SPHSimParams` (`dt = stepDt / substeps`, `dt_frame = stepDt`) ligada por offset dinâmico. Massa,
suavização, rigidez, viscosidade, restituição e domínio vêm da física.

O espaço de trabalho — parâmetros por iteração, busca de vizinhança (recriada quando a grade da física muda) e
`ColliderSet` — é do Resource de trabalho (`SPHWork`); as normais e a fronteira por partícula são pools do próprio
corpo (spec 039). Tudo é preparado e religado em transições (`framePrepare`, entidades e pools de collider), nunca no
`dispatch`.

## Extends

- [`Flow`](../../platform/web/classes/Flow.md)\<[`SPHSlots`](../interfaces/SPHSlots.md), `"running"`\>

## Constructors

### Constructor

> **new SPHFlow**(`ctx`, `options?`): `SPHFlow`

Defined in: [src/elements/physics/flows/SPHFlow.ts:124](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SPHFlow.ts#L124)

#### Parameters

##### ctx

[`FlowContext`](../../platform/web/interfaces/FlowContext.md)

##### options?

[`SPHFlowOptions`](../interfaces/SPHFlowOptions.md) = `{}`

#### Returns

`SPHFlow`

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

> `protected` `readonly` **initialState**: `"running"`

Defined in: [src/elements/physics/flows/SPHFlow.ts:104](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SPHFlow.ts#L104)

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

> `readonly` **pipelines**: readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

Defined in: [src/elements/physics/flows/SPHFlow.ts:103](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SPHFlow.ts#L103)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`pipelines`](../../platform/web/classes/Flow.md#pipelines)

***

### slots

> `readonly` **slots**: [`SPHSlots`](../interfaces/SPHSlots.md)

Defined in: [src/elements/physics/flows/SPHFlow.ts:102](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SPHFlow.ts#L102)

Slots consumidos, por nome.

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`slots`](../../platform/web/classes/Flow.md#slots)

***

### transitions

> `protected` `readonly` **transitions**: [`FlowTransitions`](../../platform/web/type-aliases/FlowTransitions.md)\<`"running"`, [`TransitionContext`](../../platform/web/interfaces/TransitionContext.md)\<[`SPHSlots`](../interfaces/SPHSlots.md)\>\>

Defined in: [src/elements/physics/flows/SPHFlow.ts:105](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SPHFlow.ts#L105)

Tabela de transições (estado × evento).

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`transitions`](../../platform/web/classes/Flow.md#transitions)

***

### type

> `readonly` **type**: `"SPHFlow"` = `'SPHFlow'`

Defined in: [src/elements/physics/flows/SPHFlow.ts:101](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SPHFlow.ts#L101)

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

Defined in: [src/elements/physics/flows/SPHFlow.ts:211](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SPHFlow.ts#L211)

Grava as iterações do quadro (decididas em `framePrepare`).

#### Parameters

##### frame

[`Frame`](../../platform/web/interfaces/Frame.md)

##### bound

[`BoundFlow`](../../platform/web/interfaces/BoundFlow.md)\<[`SPHSlots`](../interfaces/SPHSlots.md)\>

#### Returns

`void`

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`dispatch`](../../platform/web/classes/Flow.md#dispatch)

***

### dispose()

> **dispose**(): `void`

Defined in: [src/elements/physics/flows/SPHFlow.ts:250](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SPHFlow.ts#L250)

Libera os kernels da busca de vizinhança (os buffers são do `SPHWork` e saem da cena com ele).

#### Returns

`void`

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`dispose`](../../platform/web/classes/Flow.md#dispose)
