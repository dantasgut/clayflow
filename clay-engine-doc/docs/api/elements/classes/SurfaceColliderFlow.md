[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / SurfaceColliderFlow

# Class: SurfaceColliderFlow

Defined in: [src/elements/physics/flows/SurfaceColliderFlow.ts:143](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SurfaceColliderFlow.ts#L143)

SurfaceColliderFlow — constrói na GPU o campo dos `SurfaceCollider` (spec 010, R2): para cada superfície colidível,
a superfície é avaliada pelo mesmo `surface_at` do desenho (função da entidade ou pronta, espaço da cena) numa grade
de amostragem, e o campo — alturas (rasterização dos triângulos com `atomicMax`) ou distâncias com sinal (semeadura
exata, jump flooding, sinal pela normal) — é escrito no pool do colisor, com a caixa local, a inversa do mundo e a
matriz normal no cabeçalho.

Roda na física antes dos solvers. Superfície que anima (`animated`, espaço na cena ou `TransformFunction`): uma cópia
por passo fixo do quadro, cada uma no tempo do fim do seu passo — os solvers leem a do passo corrente pelo cursor
(mesma trajetória a 30/60/144 Hz). Parada: uma cópia, construída só quando a superfície, o colisor ou o `Transform`
mudam. A função nova vale quando o pipeline compila; rejeitada, o último campo continua.

## Extends

- [`Flow`](../../platform/web/classes/Flow.md)\<[`SurfaceColliderSlots`](../interfaces/SurfaceColliderSlots.md), `"idle"`\>

## Constructors

### Constructor

> **new SurfaceColliderFlow**(`ctx`): `SurfaceColliderFlow`

Defined in: [src/elements/physics/flows/SurfaceColliderFlow.ts:161](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SurfaceColliderFlow.ts#L161)

#### Parameters

##### ctx

[`FlowContext`](../../platform/web/interfaces/FlowContext.md)

#### Returns

`SurfaceColliderFlow`

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

Defined in: [src/elements/physics/flows/SurfaceColliderFlow.ts:148](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SurfaceColliderFlow.ts#L148)

Estado inicial do algoritmo.

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`initialState`](../../platform/web/classes/Flow.md#initialstate)

***

### listens

> `readonly` **listens**: [`WgslPoint`](../../platform/web/interfaces/WgslPoint.md)[]

Defined in: [src/elements/physics/flows/SurfaceColliderFlow.ts:147](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SurfaceColliderFlow.ts#L147)

Os registros de todas as formas das funções `surface` (spec 031, R8).

#### Overrides

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

> `readonly` **slots**: [`SurfaceColliderSlots`](../interfaces/SurfaceColliderSlots.md)

Defined in: [src/elements/physics/flows/SurfaceColliderFlow.ts:145](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SurfaceColliderFlow.ts#L145)

Slots consumidos, por nome.

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`slots`](../../platform/web/classes/Flow.md#slots)

***

### transitions

> `protected` `readonly` **transitions**: [`FlowTransitions`](../../platform/web/type-aliases/FlowTransitions.md)\<`"idle"`, `Ctx`\>

Defined in: [src/elements/physics/flows/SurfaceColliderFlow.ts:149](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SurfaceColliderFlow.ts#L149)

Tabela de transições (estado × evento).

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`transitions`](../../platform/web/classes/Flow.md#transitions)

***

### type

> `readonly` **type**: `"SurfaceColliderFlow"` = `'SurfaceColliderFlow'`

Defined in: [src/elements/physics/flows/SurfaceColliderFlow.ts:144](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SurfaceColliderFlow.ts#L144)

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

Defined in: [src/elements/physics/flows/SurfaceColliderFlow.ts:242](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SurfaceColliderFlow.ts#L242)

Grava as passadas dos colliders a construir neste quadro.

#### Parameters

##### frame

[`Frame`](../../platform/web/interfaces/Frame.md)

##### bound

[`BoundFlow`](../../platform/web/interfaces/BoundFlow.md)\<[`SurfaceColliderSlots`](../interfaces/SurfaceColliderSlots.md)\>

#### Returns

`void`

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`dispatch`](../../platform/web/classes/Flow.md#dispatch)

***

### dispose()

> **dispose**(): `void`

Defined in: [src/elements/physics/flows/SurfaceColliderFlow.ts:285](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/SurfaceColliderFlow.ts#L285)

Esquece os estados (rascunhos, parâmetros e substitutos são do trabalho e saem da cena com ele).

#### Returns

`void`

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`dispose`](../../platform/web/classes/Flow.md#dispose)
