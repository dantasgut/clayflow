[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / SurfaceFlow

# Class: SurfaceFlow

Defined in: [src/elements/geometry/SurfaceFlow.ts:145](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/SurfaceFlow.ts#L145)

SurfaceFlow — superfícies paramétricas avaliadas na GPU (spec 009): para cada `ParametricSurface`, o kernel
`surface_eval` escreve posição, normal e uv da grade a partir da função `surface` da entidade (`SurfaceFunction`, com
derivadas analíticas quando ela as define) ou da superfície pronta, com o espaço da cena (`SpaceFunction`, composto
pela C2). Avalia quando a superfície entra ou muda, quando a função muda (valores ou código) e a cada quadro com
`animated` ou com espaço na cena. A função nova vale quando o pipeline compila; rejeitada, segue a anterior.

## Extends

- [`Flow`](../../platform/web/classes/Flow.md)\<[`SurfaceSlots`](../interfaces/SurfaceSlots.md), `"idle"`\>

## Constructors

### Constructor

> **new SurfaceFlow**(`ctx`): `SurfaceFlow`

Defined in: [src/elements/geometry/SurfaceFlow.ts:168](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/SurfaceFlow.ts#L168)

#### Parameters

##### ctx

[`FlowContext`](../../platform/web/interfaces/FlowContext.md)

#### Returns

`SurfaceFlow`

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

Defined in: [src/elements/geometry/SurfaceFlow.ts:150](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/SurfaceFlow.ts#L150)

Estado inicial do algoritmo.

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`initialState`](../../platform/web/classes/Flow.md#initialstate)

***

### listens

> `readonly` **listens**: ([`StructSchema`](../../platform/web/classes/StructSchema.md) \| [`WgslPoint`](../../platform/web/interfaces/WgslPoint.md))[]

Defined in: [src/elements/geometry/SurfaceFlow.ts:149](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/SurfaceFlow.ts#L149)

Os registros de todas as formas das funções `surface` (spec 031, R8) e os vértices das superfícies.

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

> `readonly` **slots**: [`SurfaceSlots`](../interfaces/SurfaceSlots.md)

Defined in: [src/elements/geometry/SurfaceFlow.ts:147](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/SurfaceFlow.ts#L147)

Slots consumidos, por nome.

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`slots`](../../platform/web/classes/Flow.md#slots)

***

### transitions

> `protected` `readonly` **transitions**: [`FlowTransitions`](../../platform/web/type-aliases/FlowTransitions.md)\<`"idle"`, `Ctx`\>

Defined in: [src/elements/geometry/SurfaceFlow.ts:151](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/SurfaceFlow.ts#L151)

Tabela de transições (estado × evento).

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`transitions`](../../platform/web/classes/Flow.md#transitions)

***

### type

> `readonly` **type**: `"SurfaceFlow"` = `'SurfaceFlow'`

Defined in: [src/elements/geometry/SurfaceFlow.ts:146](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/SurfaceFlow.ts#L146)

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

Defined in: [src/elements/geometry/SurfaceFlow.ts:248](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/SurfaceFlow.ts#L248)

Uma avaliação por superfície marcada neste quadro.

#### Parameters

##### frame

[`Frame`](../../platform/web/interfaces/Frame.md)

##### bound

[`BoundFlow`](../../platform/web/interfaces/BoundFlow.md)\<[`SurfaceSlots`](../interfaces/SurfaceSlots.md)\>

#### Returns

`void`

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`dispatch`](../../platform/web/classes/Flow.md#dispatch)

***

### dispose()

> **dispose**(): `void`

Defined in: [src/elements/geometry/SurfaceFlow.ts:298](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/geometry/SurfaceFlow.ts#L298)

Esquece os estados (os objetos de GPU são do `SurfaceWork`; a C2 os libera com ele).

#### Returns

`void`

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`dispose`](../../platform/web/classes/Flow.md#dispose)
